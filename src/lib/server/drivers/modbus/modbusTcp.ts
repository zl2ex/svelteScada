import {
  OPCUAServer,
  DataType,
  type UAVariable,
  type Namespace,
  type NodeIdLike,
  StatusCode,
  StatusCodes,
} from "node-opcua";

import Modbus, { ModbusTCPClient } from "jsmodbus";
import net from "net";
import { array, z } from "zod";
import {
  resolveOpcuaPath,
  Tag,
  TagError,
  type BaseTypeStrings,
} from "../../tag/tag";
import { logger } from "../../pino/logger";
import { attempt } from "../../../../lib/util/attempt";
import { DriverStatusError } from "../driver";
import { ErrorMessages } from "jsmodbus/dist/codes";
import { deleteOpcuaVariable } from "../opcua/opcuaServer";

type ModbusRegisterType = "hr" | "ir" | "co" | "di";

type ParsedModbusPath = {
  dataType: BaseTypeStrings;
  registerType: ModbusRegisterType;
  address: number;
  registerLength: number;
  arrayLength: number | undefined;
  endian: Endian;
  swapWords: boolean;
  bit: number | undefined;
};
export interface TagSubscription extends ParsedModbusPath {
  // nodeId: string;
  // path: string;
  opcuaDataType: DataType;
  driverOpcuaVarible: UAVariable;
  value: number;
  tags: Map<string, Tag<any>>;
}

export const Z_Endian = z.literal(["BigEndian", "LittleEndian"]);
export type Endian = z.infer<typeof Z_Endian>;

export const Z_ModbusTCPDriverOptions = z.object({
  ip: z.ipv4(),
  port: z.number().int().min(1).max(65535).optional().default(502),
  unitId: z.number().int().min(1).optional().default(1),
  pollingIntervalMs: z.number().int().min(500).optional().default(1000),
  spanGaps: z.coerce.boolean<boolean>().default(false),
  reconnectInervalMs: z.number().min(500).optional().default(5000),
  startAddress: z.number().min(0).max(1).optional().default(0),
  endian: Z_Endian.optional().default("LittleEndian"),
  swapWords: z.coerce.boolean<boolean>().default(false),
});

export type ModbusTCPDriverOptions = z.input<typeof Z_ModbusTCPDriverOptions>;
export class ModbusTCPDriver {
  private opcuaServer: OPCUAServer;
  private client: ModbusTCPClient;
  private socket: net.Socket;
  private namespace: Namespace;
  private subscriptions: Record<string, TagSubscription> = {};
  private pollTimer?: NodeJS.Timeout;
  private reconnectTimer?: NodeJS.Timeout;

  reconnectAttempt: boolean = true;
  pollingIntervalMs: number;
  spanGaps: boolean;
  ip: string;
  port: number;
  unitId: number;
  reconnectInervalMs: number;
  startAddress: number;
  endian: Endian;
  swapWords: boolean;
  connected: boolean = false;

  constructor(opcuaServer: OPCUAServer, opts: ModbusTCPDriverOptions) {
    const config = Z_ModbusTCPDriverOptions.parse(opts);
    this.opcuaServer = opcuaServer;
    this.ip = config.ip;
    this.port = config.port;
    this.unitId = config.unitId;
    this.pollingIntervalMs = config.pollingIntervalMs;
    this.spanGaps = config.spanGaps;
    this.reconnectInervalMs = config.reconnectInervalMs;
    this.startAddress = config.startAddress;
    this.endian = config.endian;
    this.swapWords = config.swapWords;
    this.namespace = this.opcuaServer.engine.addressSpace!.getOwnNamespace();

    this.socket = new net.Socket();
    this.client = new Modbus.client.TCP(this.socket, this.unitId);

    this.socket.on("error", () => {
      this.stopPolling();
      this.connected = false;
      this.reconnect();
    });

    this.socket.on("close", () => {
      this.stopPolling();
      this.connected = false;
      this.reconnect();
    });
    /*
    this.socket.on("connectionAttemptFailed", () => {
      logger.debug("connectionAttemptFailed");

      this.connected = false;
      this.reconnect();
    });
    this.socket.on("connectionAttemptTimeout", () => {
      logger.debug("connectionAttemptTimeout");

      this.connected = false;
      this.reconnect();
    });
    */
    //TD WIP More events for connection status  ??
  }

  [Symbol.dispose]() {
    this.dispose();
  }

  dispose() {
    this.disconnect();
    this.stopPolling();
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.socket.removeAllListeners();
    // If still connected, end gracefully
    if (!this.socket.destroyed) {
      this.socket.end(); // Tries to close cleanly (sends FIN)
    }
    this.socket.destroy();
    //this.socket = undefined;
    for (const sub of Object.values(this.subscriptions)) {
      sub.tags.forEach((tag) => {
        if (tag.nodeId) tag.unsubscribeToDriver();
      });
    }
    //this.tags = undefined;
    logger.trace(`[ModbusTCPDriver] dispose()`);
  }

  private reconnect() {
    // already waiting to try again
    if (this.reconnectAttempt === false) return;
    logger.warn(
      `[ModbusTCPDriver] failed to connect to device at ${this.ip}:${this.port} retry in ${this.reconnectInervalMs} ms`
    );
    this.reconnectAttempt = false;
    this.setAllOpcuaVaribleStatus(StatusCodes.BadNotConnected);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
      this.reconnectAttempt = true;
    }, this.reconnectInervalMs);
  }

  private setAllOpcuaVaribleStatus(status: StatusCode) {
    for (const sub of Object.values(this.subscriptions)) {
      this.setOpcuaVaribleStatus(sub, status);
    }
  }

  private setOpcuaVaribleStatus(sub: TagSubscription, status: StatusCode) {
    if (sub.driverOpcuaVarible && sub.driverOpcuaVarible.addressSpace) {
      if (sub.driverOpcuaVarible.readValue().statusCode == status) {
        return; // dont update the status if it has not changed
      }
      sub.driverOpcuaVarible.setValueFromSource(
        {
          dataType: sub.opcuaDataType,
          value: sub.value,
        },
        status
      );
      //sub.sub.update(sub.value)
      sub.tags.forEach((tag) => tag.triggerEmit()); // emit new status to client
    }
  }

  connect() {
    this.socket.connect(this.port, this.ip, () => {
      if (this.connected === true) return;
      logger.info(
        `[ModbusTCPDriver] Connected to Modbus device at ${this.ip}:${this.port}`
      );
      this.connected = true;
      this.startPolling();
    });
  }

  disconnect() {
    this.connected = false;
    this.stopPolling();
    this.socket.destroy();
    this.setAllOpcuaVaribleStatus(StatusCodes.BadConditionDisabled);
    logger.info(
      `[ModbusTCPDriver] Disconnected from Modbus device at ${this.ip}:${this.port}`
    );
  }

  getSubscriptions() {
    return Object.values(this.subscriptions);
  }

  subscribeByTag(tag: Tag<any>, parent?: NodeIdLike): UAVariable | undefined {
    if (!tag.nodeId) {
      throw new Error(
        `[ModbusTCPDriver] subscribeByTag() no node id provided for tag ${tag.path}`
      );
    }
    const nodeId = tag.nodeId;
    const resolvedPath = resolveOpcuaPath(nodeId);

    if (!resolvedPath.tagPath) {
      throw new Error(
        `[ModbusTCPDriver] subscribeByTag() empty tag nodeId for nodeId ${nodeId}`
      );
    }
    const parsed = this.parsePath(resolvedPath.tagPath);
    if (!parsed) {
      throw new Error(
        `[ModbusTCPDriver] subscribeByTag() Invalid Modbus path: ${nodeId}`
      );
    }

    let opcuaParent = parent ?? tag.tagFolder;
    if (!opcuaParent) {
      throw new Error(
        `[ModbusTCPDriver] subscribeByTag() tag ${nodeId} cannot subscribe because parent or root folder is not provided`
      );
    }

    const monitoredCount = this.subscriptions[nodeId]?.tags.size;
    // return varibleNode if multiple tags reference the same address
    if (monitoredCount >= 1) {
      this.subscriptions[nodeId].tags.set(tag.path, tag);
      logger.trace(
        `[ModbusTcpDriver] subscribeByTag() varible already exists at ${tag.nodeId} returning varible already set up to tag ${tag.path}`
      );
      return this.subscriptions[nodeId].driverOpcuaVarible;
    }

    if (
      !Object.values(DataType).includes(parsed.dataType as unknown as DataType)
    ) {
      throw new Error(
        `[ModbusTCPDriver] subscribeByTag() dataType ${parsed.dataType} is not supported by the internal OPCUA Server`
      );
    }

    // if(this.namespace.findNode(nodeId)) return existingOpcuaVarible;

    const opcuaDataType = parsed.dataType as unknown as DataType;

    const node = this.namespace.findNode(nodeId);

    if (node) {
      logger.warn(node.allReferences(), "Exists, and references are:");
      node.allReferences().forEach((ref) => {
        node.removeReference(ref);
      });
    }

    const driverOpcuaVarible = this.namespace.addVariable({
      componentOf: opcuaParent,
      nodeId: nodeId,
      browseName: nodeId,
      dataType: opcuaDataType,
    });

    // write to modbusDevice when opcuaVarible is changed
    driverOpcuaVarible.on("value_changed", async (newValue) => {
      const sub = this.subscriptions[nodeId];
      if (!sub) {
        throw new Error(`[ModbusTCPDriver] nodeId not valid ${nodeId}`);
      }

      if (sub.value !== newValue.value.value) {
        logger.trace(
          `[ModbusTCPDriver] valueChanged ${sub.address} = ${newValue.value.value} : ${newValue.statusCode.toString()}`
        );
        try {
          await this.writeModbus(parsed, newValue.value.value);
          sub.value = newValue.value.value;
        } catch (error) {
          let opcuaStatus = StatusCodes.BadNotConnected;

          // also reverts value to sub.value
          // queue update for after the on_changed handler has finished executing
          if (error instanceof DriverStatusError) {
            opcuaStatus = error.opcuaStatus;
          }
          queueMicrotask(() => {
            this.setOpcuaVaribleStatus(sub, opcuaStatus); // result.error is of type unkown
          });
        }
      }
    });

    const subscription: TagSubscription = {
      dataType: parsed.dataType,
      opcuaDataType: tag.opcuaDataType,
      driverOpcuaVarible: driverOpcuaVarible,
      address: parsed.address,
      registerType: parsed.registerType,
      registerLength: parsed.registerLength,
      endian: this.endian,
      swapWords: this.swapWords,
      arrayLength: parsed.arrayLength,
      bit: parsed.bit,
      tags: new Map().set(tag.path, tag),
      value: 0,
    };

    this.subscriptions[nodeId] = subscription;
    logger.debug(
      `[ModbusTCPDriver] subscribeByTag() Created OPCUA node and subscription for ${nodeId}`
    );
    return driverOpcuaVarible;
  }

  unsubscribeByTag(tag: Tag<any>) {
    if (!tag.nodeId) return;

    this.subscriptions[tag.nodeId].tags.delete(tag.path);
    if (this.subscriptions[tag.nodeId].tags.size > 0) {
      logger.debug(
        `[ModbusTCPDriver] unsubscribeByTag() ${tag.nodeId} monitored count ${this.subscriptions[tag.nodeId].tags.size} not removing varible node`
      );
      return; // dont remove if there are more insances looking at the varible
    }
    const resolvedPath = resolveOpcuaPath(tag.nodeId);

    if (!resolvedPath.tagPath) {
      throw new Error(
        `[ModbusTCPDriver] unsubscribeByTag() empty tag nodeId for path ${tag}`
      );
    }
    const parsed = this.parsePath(resolvedPath.tagPath);
    if (!parsed) {
      throw new Error(
        `[ModbusTCPDriver] unsubscribeByTag() Invalid Modbus path: ${tag}`
      );
    }

    if (!this.opcuaServer.engine.addressSpace) {
      throw new Error(
        `[ModbusTCPDriver] unsubscribeByTag() pcuaServer.engine.addressSpace not defined, cannot remove opcua varible at ${tag.nodeId}`
      );
    }

    deleteOpcuaVariable(
      this.opcuaServer.engine.addressSpace,
      this.subscriptions[tag.nodeId].driverOpcuaVarible
    );

    delete this.subscriptions[tag.nodeId]; // remove the subscription entirely
    logger.debug(`[ModbusTCPDriver] unsubscribeByTag() ${tag.nodeId}`);
  }

  private startPolling() {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(
      () => this.pollModbus(),
      this.pollingIntervalMs
    );
    logger.info(
      `[ModbusTCPDriver] Started Modbus polling at ${this.pollingIntervalMs} ms interval`
    );
  }

  private stopPolling() {
    this.setAllOpcuaVaribleStatus(StatusCodes.BadConditionDisabled);
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
      logger.info("[ModbusTCPDriver] Stopped Modbus polling");
    }
  }

  private async pollModbus() {
    // no tags to poll
    if (Object.keys(this.subscriptions).length === 0) return;

    // Group tags by type
    const groups = new Map<ModbusRegisterType, TagSubscription[]>();
    for (const [key, tag] of Object.entries(this.subscriptions)) {
      if (tag.tags.size === 0) continue;
      if (!groups.has(tag.registerType)) {
        groups.set(tag.registerType, []);
      }
      groups.get(tag.registerType)!.push(tag);
    }

    for (const [type, subs] of groups.entries()) {
      subs.sort((a, b) => a.address - b.address);

      let batches: Array<{ start: number; end: number }> = [];
      if (this.spanGaps) {
        const start = subs[0].address;
        const end =
          subs[subs.length - 1].address + subs[subs.length - 1].registerLength; // TD WIP ArrayLength
        batches = [{ start, end }];
      } else {
        batches = this.splitIntoBatches(subs);
      }

      for (const batch of batches) {
        const length = batch.end - batch.start;
        if (length <= 0 || batch.start < 0 || batch.start >= 65535) {
          logger.error(
            `[ModbusTCPDriver] poll() batch address out of range  start: ${batch.start}  end: ${batch.end}`
          );
          continue;
        }
        let response;
        switch (type) {
          case "hr":
            response = await attempt(() =>
              this.client.readHoldingRegisters(batch.start, length)
            );
            break;
          case "ir":
            response = await attempt(() =>
              this.client.readInputRegisters(batch.start, length)
            );
            break;
          case "co":
            response = await attempt(() =>
              this.client.readCoils(batch.start, length)
            );
            break;
          case "di":
            response = await attempt(() =>
              this.client.readDiscreteInputs(batch.start, length)
            );
            break;
          default:
            throw new Error(`[ModbusTCPDriver] registerType ${type} invalid`);
            break;
        }

        for (const sub of subs) {
          if (sub.address < batch.start || sub.address > batch.end) continue;
          for (const tag of sub.tags.values()) {
            if (tag.driverOpcuaVarible && tag.driverOpcuaVarible.addressSpace) {
              if ("error" in response) {
                logger.error(response.error);
                for (const tag of sub.tags.values()) {
                  tag.error = new TagError("nodeId", response.error.message);
                }
                continue;
              }

              const buffer = response.data.response.body.valuesAsBuffer;

              const offset = sub.address - batch.start;
              let value = decode(sub, buffer, offset);
              const oldValue = tag.driverOpcuaVarible?.readValue().value.value;

              if (oldValue !== value) {
                logger.trace(
                  `[ModbusTCPDriver] poll() updated varible ${tag.path} = ${value}`
                );
                // TD i have my own typesafety at runtime with opcuaDataType
                //@ts-ignore
                sub.value = value;
                tag.driverOpcuaVarible.setValueFromSource(
                  {
                    dataType: tag.opcuaDataType,
                    value: value,
                  },
                  StatusCodes.Good
                );
                tag.error = undefined;
              }
            } else {
              const errorMessage = `[ModbusTCPDriver] poll() driverOpcuaVarible.addressSpace undefined for tag ${tag.path}`;
              tag.error = new TagError("nodeId", errorMessage);
              logger.error(errorMessage);
            }
          }
        }
      }
    }
  }

  private splitIntoBatches(
    subs: TagSubscription[]
  ): Array<{ start: number; end: number }> {
    const batches: Array<{ start: number; end: number }> = [];

    if (subs.length === 0) return batches;

    // sort by address
    subs.sort((a, b) => a.address - b.address);

    let start = subs[0].address;
    let prev = start + subs[0].registerLength; // TD WIP ArrayLength

    for (let i = 1; i < subs.length; i++) {
      const curr = subs[i].address;
      if (curr >= prev + subs[i].registerLength) {
        batches.push({ start, end: prev });
        start = curr;
      }
      prev = curr + subs[i].registerLength;
    }
    batches.push({ start, end: prev });
    return batches;
  }

  private async writeModbus(modbusInfo: ParsedModbusPath, value: number) {
    ///let data = new DataView(5, );
    /*let multiplier = modbusInfo.arrayLength ?? 1;
    const buffer = Buffer.alloc(modbusInfo.registerLength * 2 * multiplier);

    const data = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength
    );*/

    try {
      let buffer = encode(modbusInfo, value);

      if (modbusInfo.registerType === "hr") {
        await this.client.writeMultipleRegisters(modbusInfo.address, buffer);
      } else if (modbusInfo.registerType === "co") {
        if (modbusInfo.dataType !== "Boolean")
          throw new DriverStatusError(
            StatusCodes.BadConfigurationError,
            `[ModbusTCPDriver] invalid dataType ${modbusInfo.dataType} for writing to Coil at address ${modbusInfo.address}`
          );
        await this.client.writeSingleCoil(modbusInfo.address, value !== 0);
      } else {
        throw new DriverStatusError(
          StatusCodes.BadConfigurationError,
          `[ModbusTCPDriver] Write not supported for Modbus type: ${modbusInfo.registerType}`
        );
      }
    } catch (error) {
      logger.error(
        error,
        `[ModbusTCPDriver] Failed to write Modbus ${modbusInfo.registerType} address ${modbusInfo.address}:`
      );
      if (error instanceof DriverStatusError) {
        throw error;
      } else {
        // @ts-ignore
        throw new DriverStatusError(StatusCodes.BadNotConnected, error.message);
      }
    }
  }

  private parsePath(path: string): ParsedModbusPath {
    // Expecting format like "<Int32>(le|sw)hr100"
    // or "<Double>hr10"
    const regex =
      /^<(?<dataType>Int16|Int32|Double|Boolean|String)(?:\[(?<arrayLength>\d+)])?>(?:\((?<flags>[a-z|]+)\))?(?<registerType>hr|ir|co|di)(?<address>\d+)(?:\.(?<bit>\d+))?$/;

    const m = path.match(regex);
    if (!m?.groups) {
      throw new Error(`[ModbusTCPDriver] cannot parse modbus path ${path}`);
    }

    const dataType = m.groups.dataType as BaseTypeStrings;

    if (!typeHandlers[dataType].size) {
      throw new Error(
        `[ModbusTCPDriver] dataType ${dataType} not supported or implimented yet`
      );
    }

    let registerLength = typeHandlers[dataType].size / 2; // size is in bytes and we want words
    if (registerLength < 1) registerLength = 1; // we have to read at least 1 register

    let endian: Endian = this.endian;
    let swapWords = this.swapWords;

    if (m.groups.flags) {
      const flagList = m.groups.flags.split("|").map((f) => f.trim());
      if (flagList.includes("le")) endian = "LittleEndian";
      if (flagList.includes("be")) endian = "BigEndian";
      if (flagList.includes("sw")) swapWords = true;
    }

    return {
      dataType: m.groups.dataType as BaseTypeStrings,
      registerType: m.groups.registerType as ModbusRegisterType,
      address: parseInt(m.groups.address, 10) - this.startAddress,
      registerLength,
      arrayLength: m.groups.arrayLength
        ? parseInt(m.groups.arrayLength, 10)
        : undefined,
      bit: m.groups.bit ? parseInt(m.groups.bit, 10) : undefined,
      endian,
      swapWords,
    };
  }
}
/*
const typeHandlers = {
  Boolean: {
    size: 2,
    read: (view: DataView, offset: number, bit: number): boolean => {
      let data = view.getUint16(offset);
      return data && 1 << bit ? true : false;
    },
    write: (view: DataView, offset: number, bit: number, value: boolean) => {
      let val: number = value ? 1 : 0;
      let data: number = val << bit;
      view.setUint16(offset, data);
    },
  },
  SByte: {
    size: 1,
    read: (view: DataView, offset: number, bit: number) => view.getInt8(offset),
    write: (view: DataView, offset: number, bit: number, value: number) =>
      view.setInt8(offset, value),
  },
  Byte: {
    size: 1,
    read: (view: DataView, offset: number, bit: number) =>
      view.getUint8(offset),
    write: (view: DataView, offset: number, bit: number, value: number) =>
      view.setUint8(offset, value),
  },
  Int16: {
    size: 2,
    read: (view: DataView, offset: number, littleEndian: boolean) =>
      view.getInt16(offset, littleEndian),
    write: (
      view: DataView,
      offset: number,
      value: number,
      littleEndian: boolean
    ) => view.setInt16(offset, value, littleEndian),
  },
  UInt16: {
    size: 2,
    read: (view: DataView, offset: number, littleEndian: boolean) =>
      view.getUint16(offset, littleEndian),
    write: (
      view: DataView,
      offset: number,
      value: number,
      littleEndian: boolean
    ) => view.setUint16(offset, value, littleEndian),
  },
  Int32: {
    size: 4,
    read: (view: DataView, offset: number, littleEndian: boolean) =>
      view.getInt32(offset, littleEndian),
    write: (
      view: DataView,
      offset: number,
      value: number,
      littleEndian: boolean
    ) => view.setInt32(offset, value, littleEndian),
  },
  UInt32: {
    size: 4,
    read: (view: DataView, offset: number, littleEndian: boolean) =>
      view.getUint32(offset, littleEndian),
    write: (
      view: DataView,
      offset: number,
      value: number,
      littleEndian: boolean
    ) => view.setUint32(offset, value, littleEndian),
  },
  Float: {
    size: 4,
    read: (view: DataView, offset: number, littleEndian: boolean) =>
      view.getFloat32(offset, littleEndian),
    write: (
      view: DataView,
      offset: number,
      value: number,
      littleEndian: boolean
    ) => view.setFloat32(offset, value, littleEndian),
  },
  Double: {
    size: 8,
    read: (view: DataView, offset: number, littleEndian: boolean) =>
      view.getFloat64(offset, littleEndian),
    write: (
      view: DataView,
      offset: number,
      value: number,
      littleEndian: boolean
    ) => view.setFloat64(offset, value, littleEndian),
  },
  String: {
    size: undefined, // variable length
    read: (
      view: DataView,
      offset: number,
      littleEndian: boolean,
      length: number
    ) => {
      const bytes = new Uint8Array(view.buffer, offset, length);
      return new TextDecoder().decode(bytes);
    },
    write: (view: DataView, offset: number, value: string) => {
      const bytes = new TextEncoder().encode(value);
      new Uint8Array(view.buffer).set(bytes, offset);
    },
  },
} as const;
*/

export type ReadWriteOptions = {
  view: DataView;
  offset: number;
  littleEndian?: boolean;
  bit?: number;
  length?: number;
};

export const typeHandlers = {
  Boolean: {
    size: 2,
    read: ({ view, offset, bit }: ReadWriteOptions): boolean => {
      const data = view.getUint16(offset);
      if (!bit) return data ? true : false;
      return (data & (1 << bit)) !== 0;
    },
    write: ({
      view,
      offset,
      bit = 0,
      value,
    }: ReadWriteOptions & { value: boolean }) => {
      let data = view.getUint16(offset);
      if (value) {
        data |= 1 << bit;
      } else {
        data &= ~(1 << bit);
      }
      view.setUint16(offset, data);
    },
  },
  SByte: {
    size: 1,
    read: ({ view, offset }: ReadWriteOptions) => view.getInt8(offset),
    write: ({ view, offset, value }: ReadWriteOptions & { value: number }) =>
      view.setInt8(offset, value),
  },
  Byte: {
    size: 1,
    read: ({ view, offset }: ReadWriteOptions) => view.getUint8(offset),
    write: ({ view, offset, value }: ReadWriteOptions & { value: number }) =>
      view.setUint8(offset, value),
  },
  Int16: {
    size: 2,
    read: ({ view, offset, littleEndian = false }: ReadWriteOptions) =>
      view.getInt16(offset, littleEndian),
    write: ({
      view,
      offset,
      value,
      littleEndian = false,
    }: ReadWriteOptions & { value: number }) =>
      view.setInt16(offset, value, littleEndian),
  },
  UInt16: {
    size: 2,
    read: ({ view, offset, littleEndian = false }: ReadWriteOptions) =>
      view.getUint16(offset, littleEndian),
    write: ({
      view,
      offset,
      value,
      littleEndian = false,
    }: ReadWriteOptions & { value: number }) =>
      view.setUint16(offset, value, littleEndian),
  },
  Int32: {
    size: 4,
    read: ({ view, offset, littleEndian = false }: ReadWriteOptions) =>
      view.getInt32(offset, littleEndian),
    write: ({
      view,
      offset,
      value,
      littleEndian = false,
    }: ReadWriteOptions & { value: number }) =>
      view.setInt32(offset, value, littleEndian),
  },
  UInt32: {
    size: 4,
    read: ({ view, offset, littleEndian = false }: ReadWriteOptions) =>
      view.getUint32(offset, littleEndian),
    write: ({
      view,
      offset,
      value,
      littleEndian = false,
    }: ReadWriteOptions & { value: number }) =>
      view.setUint32(offset, value, littleEndian),
  },
  Float: {
    size: 4,
    read: ({ view, offset, littleEndian = false }: ReadWriteOptions) =>
      view.getFloat32(offset, littleEndian),
    write: ({
      view,
      offset,
      value,
      littleEndian = false,
    }: ReadWriteOptions & { value: number }) =>
      view.setFloat32(offset, value, littleEndian),
  },
  Double: {
    size: 8,
    read: ({ view, offset, littleEndian = false }: ReadWriteOptions) =>
      view.getFloat64(offset, littleEndian),
    write: ({
      view,
      offset,
      value,
      littleEndian = false,
    }: ReadWriteOptions & { value: number }) =>
      view.setFloat64(offset, value, littleEndian),
  },
  String: {
    size: undefined as number | undefined, // variable length
    read: ({ view, offset, length = 0 }: ReadWriteOptions): string => {
      const bytes = new Uint8Array(view.buffer, offset, length);
      return new TextDecoder().decode(bytes);
    },
    write: ({ view, offset, value }: ReadWriteOptions & { value: string }) => {
      const bytes = new TextEncoder().encode(value);
      new Uint8Array(view.buffer, offset, bytes.length).set(bytes);
    },
  },
} as const;

function decode(
  parsed: ParsedModbusPath,
  buffer: Buffer,
  addressOffset: number
): number | boolean | string {
  const littleEndian = parsed.endian === "LittleEndian";
  const handler = typeHandlers[parsed.dataType];
  const view = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength
  );

  let value = handler.read({
    view,
    offset: addressOffset * 2,
    littleEndian,
    length: buffer.length,
    bit: parsed.bit,
  });

  // Swap words if needed
  if (parsed.swapWords && buffer.length > 2) {
    const swapped = new Uint8Array(buffer);
    for (let i = 0; i < swapped.length; i += 2) {
      [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]];
    }
    const swappedView = new DataView(swapped.buffer);
    value = handler.read({
      view: swappedView,
      offset: addressOffset * 2,
      littleEndian,
      length: buffer.length,
      bit: parsed.bit,
    });
  }
  //logger.debug(`[ModbusTCPDriver] decode value ${value}`);

  return value;
}

function encode(parsed: ParsedModbusPath, value: any): Buffer {
  const handler = typeHandlers[parsed.dataType];
  const size = handler.size ?? (typeof value === "string" ? value.length : 0);
  const buffer = Buffer.alloc(size);
  const view = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength
  );

  const littleEndian = parsed.endian === "LittleEndian";
  handler.write({ view, offset: 0, value, littleEndian });

  if (parsed.swapWords && size > 2) {
    for (let i = 0; i < buffer.length; i += 2) {
      [buffer[i], buffer[i + 1]] = [buffer[i + 1], buffer[i]];
    }
  }

  return buffer;
}
