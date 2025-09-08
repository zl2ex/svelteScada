import {
  OPCUAServer,
  DataType,
  type UAVariable,
  type Namespace,
  type NodeIdLike,
} from "node-opcua";

import Modbus, { ModbusTCPClient } from "jsmodbus";
import net from "net";
import { z } from "zod";
import { resolveOpcuaPath, type BaseTypeStrings } from "../../tag/tag";
import { logger } from "../../../pino/logger";
import { ListIndexesCursor } from "mongodb";

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
interface TagSubscription extends ParsedModbusPath {
  path: string;
  opcuaDataType: DataType;
  variableNode: UAVariable;
  monitoredCount: number;
  value: number;
}

const Z_Endian = z.literal(["BigEndian", "LittleEndian"]);
export type Endian = z.infer<typeof Z_Endian>;

export const Z_ModbusTCPDriverOptions = z.object({
  ip: z.ipv4(),
  port: z.number().int().min(1).max(65535).optional().default(502),
  unitId: z.number().int().min(1).optional().default(1),
  pollingIntervalMs: z.number().int().min(500).optional().default(1000),
  spanGaps: z.boolean().optional().default(false),
  reconnectInervalMs: z.number().min(500).optional().default(5000),
  startAddress: z.number().min(0).max(1).optional().default(0),
  endian: Z_Endian.optional().default("LittleEndian"),
  swapWords: z.boolean().optional().default(false),
});

export type ModbusTCPDriverOptions = z.input<typeof Z_ModbusTCPDriverOptions>;
export class ModbusTCPDriver {
  private opcuaServer: OPCUAServer;
  private client: ModbusTCPClient;
  private socket: net.Socket;
  private namespace: Namespace;
  private tags: Record<string, TagSubscription> = {};
  private pollTimer?: NodeJS.Timeout;
  private reconnectAttempt: boolean = true;
  private pollingIntervalMs: number;
  private spanGaps: boolean;
  private ip: string;
  private port: number;
  private unitId: number;
  private reconnectInervalMs: number;
  private startAddress: number;
  private endian: Endian;
  private swapWords: boolean;

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

  private reconnect() {
    // already waiting to try again
    if (this.reconnectAttempt === false) return;
    logger.error(
      `[ModbusTCPDriver] failed to connect to device at ${this.ip}:${this.port} retry in ${this.reconnectInervalMs} ms`
    );
    this.reconnectAttempt = false;
    setTimeout(() => {
      this.connect();
      this.reconnectAttempt = true;
    }, this.reconnectInervalMs);
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

  subscribeByPath(path: string): UAVariable {
    const resolvedPath = resolveOpcuaPath(path);

    if (!resolvedPath.tagPath)
      throw new Error(`[ModbusTCPDriver] empty tag path for path ${path}`);
    const parsed = this.parsePath(resolvedPath.tagPath);
    if (!parsed) throw new Error(`Invalid Modbus path: ${path}`);

    // return varibleNode if multiple tags reference the same address
    if (this.tags[path]) {
      this.tags[path].monitoredCount++; // add to the monitored count
      return this.tags[path]!.variableNode;
    }

    if (
      !Object.values(DataType).includes(parsed.dataType as unknown as DataType)
    ) {
      throw new Error(
        `[ModbusTCPDriver] dataType ${parsed.dataType} is not supported by the internal OPCUA Server`
      );
    }

    let opcuaDataType = parsed.dataType as unknown as DataType;

    const variableNode = this.namespace.addVariable({
      componentOf: this.opcuaServer.engine.addressSpace?.rootFolder,
      nodeId: path,
      browseName: path,
      dataType: opcuaDataType,
    });

    // write to modbusDevice when opcuaVarible is changed
    variableNode.on("value_changed", (newValue) => {
      if (!this.tags[path])
        throw new Error(`[ModbusTCPDriver] path not valid ${path}`);

      if (this.tags[path].value !== newValue.value.value) {
        this.writeModbus(parsed, newValue.value.value);
        this.tags[path].value = newValue.value.value;
      }
    });

    const subscription: TagSubscription = {
      path,
      opcuaDataType,
      dataType: parsed.dataType,
      address: parsed.address,
      registerType: parsed.registerType,
      registerLength: parsed.registerLength,
      variableNode,
      monitoredCount: 1,
      value: 0,
      endian: this.endian,
      swapWords: this.swapWords,
      arrayLength: parsed.arrayLength,
      bit: parsed.bit,
    };

    this.tags[path] = subscription;
    logger.debug(
      `[ModbusTCPDriver] Created OPCUA node and subscription for ${path}`
    );
    return variableNode;
  }

  private totalMonitoredCount() {
    let total = 0;
    for (const [key, tag] of Object.entries(this.tags)) {
      total += tag.monitoredCount;
    }
    return total;
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
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
      logger.info("[ModbusTCPDriver] Stopped Modbus polling");
    }
  }

  private async pollModbus() {
    // no tags to poll
    if (Object.keys(this.tags).length === 0) return;

    // Group tags by type
    const groups = new Map<ModbusRegisterType, TagSubscription[]>();
    for (const [key, tag] of Object.entries(this.tags)) {
      if (tag.monitoredCount === 0) continue;
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

      //logger.debug(batches, `[ModbusTCPDriver] Batches`);

      for (const batch of batches) {
        const length = batch.end - batch.start;
        try {
          let response;
          switch (type) {
            case "hr":
              response = await this.client.readHoldingRegisters(
                batch.start,
                length
              );
              break;
            case "ir":
              response = await this.client.readInputRegisters(
                batch.start,
                length
              );
              break;
            case "co":
              response = await this.client.readCoils(batch.start, length);
              break;
            case "di":
              response = await this.client.readDiscreteInputs(
                batch.start,
                length
              );
              break;
            default:
              throw new Error(`[ModbusTCPDriver] registerType ${type} invalid`);
              break;
          }

          if (!response) continue;

          const buffer = response.response.body.valuesAsBuffer;

          for (const tag of subs) {
            if (tag.address < batch.start || tag.address > batch.end) continue;

            const offset = tag.address - batch.start;
            let value = decode(tag, buffer, offset);
            const oldValue = tag.variableNode.readValue().value.value;

            if (oldValue !== value) {
              logger.debug(
                `[ModbusTCPDriver] poll updated varible ${tag.path} = ${value}`
              );
              tag.value = value;
              tag.variableNode.setValueFromSource({
                dataType: tag.opcuaDataType,
                value,
              });
            }
          }
        } catch (error) {
          logger.error(
            error,
            `[ModbusTCPDriver] Error reading Modbus ${type} registers ${batch.start}-${batch.end}`
          );
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

    let buffer = encode(modbusInfo, value);

    try {
      if (modbusInfo.registerType === "hr") {
        await this.client.writeMultipleRegisters(modbusInfo.address, buffer);
      } else if (modbusInfo.registerType === "co") {
        if (modbusInfo.dataType !== "Boolean")
          throw new Error(
            `[ModbusTCPDriver] invalid dataType ${modbusInfo.dataType} for writing to Coil at address ${modbusInfo.address}`
          );
        await this.client.writeSingleCoil(modbusInfo.address, value !== 0);
      } else {
        throw new Error(
          `[ModbusTCPDriver] Write not supported for Modbus type: ${modbusInfo.registerType}`
        );
      }
    } catch (error) {
      logger.error(
        error,
        `[ModbusTCPDriver] Failed to write Modbus ${modbusInfo.registerType} address ${modbusInfo.address}:`
      );
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
