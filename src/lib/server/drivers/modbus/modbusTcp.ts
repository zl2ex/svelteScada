/*import Modbus, { ModbusTCPClient } from 'jsmodbus';
import net from 'node:net';

type ModbusTcpDeviceOptions = {
    ipAddress: string;
    slaveId?: number;
    port?: number;
};
import net from "net";
import { UdtTag } from "./udt-tag";

export class ModbusDevice {
  client: ModbusTCPClient;
  socket: net.Socket;
  host: string;
  port: number;
  tags: UdtTag[] = [];
  spanGaps: boolean;

  constructor(host: string, port = 502, spanGaps = false) {
    this.host = host;
    this.port = port;
    this.spanGaps = spanGaps;
    this.socket = new net.Socket();
    this.client = new Modbus.client.TCP(this.socket);
    this.socket.connect({ host: this.host, port: this.port });
  }

  registerTag(tag: UdtTag) {
    this.tags.push(tag);
  }

  async pollAll() {
    const grouped = this.groupByRegisterType(this.tags);
    for (const [type, tags] of Object.entries(grouped)) {
      const addresses = tags.map(t => t.address);
      const start = Math.min(...addresses);
      const end = Math.max(...addresses);
      const span = this.spanGaps ? end - start + 1 : null;

      const ranges = this.spanGaps
        ? [{ start, count: span!, tags }]
        : this.splitContiguous(tags);

      for (const group of ranges) {
        const { start, count, tags } = group;
        const res = await this.readModbusBlock(type as any, start, count);
        for (const tag of tags) {
          const offset = tag.address - start;
          let val;
          if (tag.type === "Float") {
            const buf = Buffer.alloc(4);
            buf.writeUInt16BE(res[offset], 0);
            buf.writeUInt16BE(res[offset + 1], 2);
            val = buf.readFloatBE(0);
          } else if (tag.type === "Int16") {
            val = res[offset];
          } else if (tag.type === "Boolean") {
            val = !!res[offset];
          }
          tag.updateValue(val);
        }
      }
    }
  }

  private groupByRegisterType(tags: UdtTag[]) {
    const out: Record<string, UdtTag[]> = {};
    for (const tag of tags) {
      if (!out[tag.registerType]) out[tag.registerType] = [];
      out[tag.registerType].push(tag);
    }
    return out;
  }

  private splitContiguous(tags: UdtTag[]) {
    const sorted = [...tags].sort((a, b) => a.address - b.address);
    const groups: { start: number; count: number; tags: UdtTag[] }[] = [];
    let group: UdtTag[] = [];

    for (const tag of sorted) {
      if (!group.length || tag.address === group[group.length - 1].address + (tag.type === "Float" ? 2 : 1)) {
        group.push(tag);
      } else {
        const start = group[0].address;
        const count = group.reduce((sum, t) => sum + (t.type === "Float" ? 2 : 1), 0);
        groups.push({ start, count, tags: group });
        group = [tag];
      }
    }
    if (group.length) {
      const start = group[0].address;
      const count = group.reduce((sum, t) => sum + (t.type === "Float" ? 2 : 1), 0);
      groups.push({ start, count, tags: group });
    }
    return groups;
  }

  private async readModbusBlock(type: string, start: number, count: number): Promise<number[]> {
    switch (type) {
      case "holding":
        return (await this.client.readHoldingRegisters(start, count)).response.body.values;
      case "input":
        return (await this.client.readInputRegisters(start, count)).response.body.values;
      case "coil":
        return (await this.client.readCoils(start, count)).response.body.values;
      case "discrete":
        return (await this.client.readDiscreteInputs(start, count)).response.body.values;
      default:
        throw new Error("Unknown register type: " + type);
    }
  }

  async writeToModbus(tag: UdtTag, value: any) {
    switch (tag.registerType) {
      case "holding":
        if (tag.type === "Float") {
          const buf = Buffer.alloc(4);
          buf.writeFloatBE(value);
          const hi = buf.readUInt16BE(0);
          const lo = buf.readUInt16BE(2);
          await this.client.writeMultipleRegisters(tag.address, [hi, lo]);
        } else {
          await this.client.writeSingleRegister(tag.address, value);
        }
        break;
      case "coil":
        await this.client.writeSingleCoil(tag.address, value);
        break;
      default:
        throw new Error("Attempt to write to read-only register: " + tag.registerType);
    }
  }
}

export class ModbusTcpDevice {
    private _socket = new net.Socket();
    private _client : ModbusTCPClient;

    constructor(options: ModbusTcpDeviceOptions) {
        this._client = new Modbus.client.TCP(this._socket, options?.slaveId || 1);

        this._socket.on('connect', () => {

            this._client.readHoldingRegisters(0, 13).then( (resp) => {
            
            // resp will look like { response : [TCP|RTU]Response, request: [TCP|RTU]Request }
            // the data will be located in resp.response.body.coils: <Array>, resp.response.body.payload: <Buffer>
            
            console.log(resp);
            
        }, console.error);
    
        });

        this._socket.connect({
            host: options.ipAddress,
            port: options?.port || 502
        })
    }
}

*/

import {
  OPCUAServer,
  Variant,
  DataType,
  StatusCodes,
  type UAVariable,
  UAMethod,
  type Namespace,
  type NodeIdLike,
  MonitoredItem,
  MonitoringMode,
} from "node-opcua";

import Modbus, { ModbusTCPClient } from "jsmodbus";
import net from "net";
import { z } from "zod";
import { resolveOpcuaPath } from "../../tag/tag";
import { logger } from "../../../pino/logger";

type ModbusRegisterType = "hr" | "ir" | "co" | "di";

interface TagSubscription {
  path: string;
  nodeId: NodeIdLike;
  address: number;
  type: ModbusRegisterType;
  variableNode: UAVariable;
  monitoredCount: number;
}

export const Z_ModbusTCPDriverOptions = z.object({
  ip: z.ipv4(),
  port: z.number().int().min(1).max(65535).optional().default(502),
  unitId: z.number().int().min(1).optional().default(1),
  spanGaps: z.boolean().optional().default(false),
});

export type ModbusTCPDriverOptions = z.infer<typeof Z_ModbusTCPDriverOptions>;

export class ModbusTCPDriver {
  private opcuaServer: OPCUAServer;
  private client!: ModbusTCPClient;
  private socket!: net.Socket;
  private namespace: Namespace;
  private tags = new Map<string, TagSubscription>();
  private pollTimer?: NodeJS.Timeout;
  private pollingIntervalMs = 500;
  private spanGaps: boolean;
  private ip: string;
  private port: number;
  private unitId: number;

  constructor(opcuaServer: OPCUAServer, opts: ModbusTCPDriverOptions) {
    const config = Z_ModbusTCPDriverOptions.parse(opts);
    this.opcuaServer = opcuaServer;
    this.ip = config.ip;
    this.port = config.port;
    this.unitId = config.unitId;
    this.spanGaps = config.spanGaps;
    this.namespace = this.opcuaServer.engine.addressSpace!.getOwnNamespace();
  }

  async connect() {
    this.socket = new net.Socket();
    this.client = new Modbus.client.TCP(this.socket, 1); // unitId 1 by default
    return new Promise<void>((resolve, reject) => {
      this.socket.connect(this.port, this.ip, () => {
        console.log(`Connected to Modbus device at ${this.ip}:${this.port}`);
        resolve();
      });
      this.socket.on("error", reject);
    });
  }

  subscribeByPath(path: string): UAVariable {
    const resolvedPath = resolveOpcuaPath(path);

    if (!resolvedPath.tagPath)
      throw new Error(`[ModbusTCPDriver] empty tag path for path ${path}`);
    const parsed = this.parsePath(resolvedPath.tagPath);
    if (!parsed) throw new Error(`Invalid Modbus path: ${path}`);

    // return varibleNode if multiple tags reference the same address
    if (this.tags.has(path)) return this.tags.get(path)!.variableNode;
    let cachedValue = 0;

    const variableNode = this.namespace.addVariable({
      componentOf: this.opcuaServer.engine.addressSpace?.rootFolder,
      nodeId: path,
      browseName: path,
      dataType: DataType.Double,
      value: {
        get: () =>
          new Variant({ dataType: DataType.Double, value: cachedValue }),
        set: (variant: Variant) => {
          if (parsed.registerType !== "hr" && parsed.registerType !== "co") {
            return StatusCodes.BadNotWritable;
          }
          cachedValue = variant.value;
          this.writeModbus(
            parsed.registerType,
            parsed.address,
            cachedValue
          ).catch(console.error);
          return StatusCodes.Good;
        },
      },
    });

    const subscription: TagSubscription = {
      path,
      nodeId: path,
      address: parsed.address,
      type: parsed.registerType,
      variableNode,
      monitoredCount: 0,
    };
    //TD WIP Not sure how this works yet
    /*
    variableNode.on("semantic_changed", (monitoredItem: MonitoredItem) => {
      monitoredItem.on("monitoringMode_changed", (mode: MonitoringMode) => {
        if (mode === MonitoringMode.Reporting) {
          subscription.monitoredCount++;
          if (subscription.monitoredCount === 1) this.startPolling();
        } else if (mode === MonitoringMode.Disabled) {
          subscription.monitoredCount = Math.max(0, subscription.monitoredCount - 1);
          if (this.totalMonitoredCount() === 0) this.stopPolling();
        }
      });
      monitoredItem.on("terminated", () => {
        subscription.monitoredCount = Math.max(0, subscription.monitoredCount - 1);
        if (this.totalMonitoredCount() === 0) this.stopPolling();
      });
    });
*/
    this.tags.set(path, subscription);
    logger.debug(
      `[ModbusTCPDriver] Created OPCUA node and subscription for ${path}`
    );
    return variableNode;
  }

  private totalMonitoredCount() {
    let total = 0;
    for (const tag of this.tags.values()) {
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
    console.log("Started Modbus polling");
  }

  private stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
      console.log("Stopped Modbus polling");
    }
  }

  private async pollModbus() {
    if (this.tags.size === 0) return;

    // Group tags by type
    const groups = new Map<ModbusRegisterType, TagSubscription[]>();
    for (const tag of this.tags.values()) {
      if (tag.monitoredCount === 0) continue;
      if (!groups.has(tag.type)) groups.set(tag.type, []);
      groups.get(tag.type)!.push(tag);
    }

    for (const [type, subs] of groups.entries()) {
      subs.sort((a, b) => a.address - b.address);

      let batches: Array<{ start: number; end: number }> = [];
      if (this.spanGaps) {
        const start = subs[0].address;
        const end = subs[subs.length - 1].address;
        batches = [{ start, end }];
      } else {
        batches = this.splitIntoBatches(subs.map((s) => s.address));
      }

      for (const batch of batches) {
        const length = batch.end - batch.start + 1;
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
          }
          if (!response) continue;

          const data =
            response.response._body.valuesAsArray ||
            response.response._body.coils;

          for (const tag of subs) {
            if (tag.address < batch.start || tag.address > batch.end) continue;
            const offset = tag.address - batch.start;
            const value = data[offset];
            const oldValue = tag.variableNode.readValue().value.value;
            if (oldValue !== value) {
              tag.variableNode.setValueFromSource({
                dataType: DataType.Double,
                value,
              });
            }
          }
        } catch (err) {
          console.error(
            `Error reading Modbus ${type} registers ${batch.start}-${batch.end}`,
            err
          );
        }
      }
    }
  }

  private splitIntoBatches(
    addresses: number[]
  ): Array<{ start: number; end: number }> {
    const batches: Array<{ start: number; end: number }> = [];
    if (addresses.length === 0) return batches;

    addresses.sort((a, b) => a - b);

    let start = addresses[0];
    let prev = start;

    for (let i = 1; i < addresses.length; i++) {
      const curr = addresses[i];
      if (curr !== prev + 1) {
        batches.push({ start, end: prev });
        start = curr;
      }
      prev = curr;
    }
    batches.push({ start, end: prev });
    return batches;
  }

  private async writeModbus(
    type: ModbusRegisterType,
    address: number,
    value: number
  ) {
    try {
      switch (type) {
        case "hr":
          await this.client.writeSingleRegister(address, value);
          break;
        case "co":
          await this.client.writeSingleCoil(address, value !== 0);
          break;
        default:
          console.warn(`Write not supported for Modbus type: ${type}`);
      }
    } catch (err) {
      console.error(`Failed to write Modbus ${type} address ${address}:`, err);
    }
  }

  private parsePath(path: string): ParesedModbusPath {
    // Expecting format like "fhr100"
    const regex = /^(i|f)(hr|ir|co|di)(\d+)(?:\.(\d+))?$/;
    //const regex = /^(?:.+)\/(hr|ir|co|di)(\d+)$/i;
    const match = path.match(regex);
    if (!match)
      throw new Error(`[ModbusTCPDriver] cannot parse modbus path ${path}`);
    return {
      datatype: match[1],
      registerType: match[2] as ModbusRegisterType,
      address: Number(match[3]),
      bit: match[4] !== undefined ? Number(match[4]) : undefined,
    };
  }
}

type ParesedModbusPath = {
  datatype: string;
  registerType: ModbusRegisterType;
  address: number;
  bit: number | undefined;
};
