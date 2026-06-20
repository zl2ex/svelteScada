import type { NodeIdLike, OPCUAServer, StatusCode } from "node-opcua";
import { ModbusTCPDriver, Z_ModbusTCPDriverOptions } from "./modbus/modbusTcp";
import { Z_ModbusRTUDriverOptions } from "./modbus/modbusRtu";
import { z } from "zod";
import { logger } from "../pino/logger";
import { collections } from "../mongodb/collections";
import { attempt } from "../../../lib/util/attempt";
import { resolveOpcuaPath, Tag } from "../tag/tag";
import { tagManager } from "../../../server";
import {
  OpcuaClientDriver,
  Z_OpcuaClientDriverOptions,
} from "./opcua/opcuaClient";

export class DriverStatusError extends Error {
  opcuaStatus: StatusCode;
  message: string;
  constructor(opcuaStatus: StatusCode, message: string) {
    super(message);
    this.message = message;
    this.opcuaStatus = opcuaStatus;
  }
}

// list of all avalible drivers
export const Z_DeviceOptions = z.discriminatedUnion("driverName", [
  z.object({
    driverName: z.literal("ModbusTCPDriver"),
    displayName: z.literal("Modbus TCP/IP Driver").optional(),
    name: z.string().nonempty(),
    options: Z_ModbusTCPDriverOptions,
    enabled: z.boolean().default(false),
  }),
  z.object({
    driverName: z.literal("ModbusRTUDriver"),
    displayName: z.literal("Modbus RTU Driver").optional(),
    name: z.string().nonempty(),
    options: Z_ModbusRTUDriverOptions,
    enabled: z.boolean().default(false),
  }),
  z.object({
    driverName: z.literal("opcuaClientDriver"),
    displayName: z.literal("Opcua Client Driver").optional(),
    name: z.string().nonempty(),
    options: Z_OpcuaClientDriverOptions,
    enabled: z.boolean().default(false),
  }),
]);

export type AvalibleDriver = {
  id: string; // internal name must match class name
  displayName: string; // UI string
};

export const avalibeDrivers: AvalibleDriver[] = Z_DeviceOptions.options.map(
  (obj) => {
    return {
      id: obj.shape.driverName.value,
      displayName: obj.shape.displayName.unwrap().value,
    };
  },
);

// Extract the type of valid driver IDsdevice
export type DriverId = (typeof avalibeDrivers)[number]["id"];

export function isValidDriver(id: string): id is DriverId {
  return avalibeDrivers.some((driver) => driver.id === id);
}

export function Z_getDefaults<Schema extends z.ZodObject>(schema: Schema) {
  return Object.fromEntries(
    Object.entries(schema.shape).map(([key, value]) => {
      if (value instanceof z.ZodDefault) return [key, value.def.defaultValue];
      return [key, undefined];
    }),
  );
}

function fromEntries<T extends readonly [PropertyKey, any]>(
  entries: Iterable<T>,
) {
  return Object.fromEntries(entries) as {
    [K in T[0]]: Extract<T, [K, any]>[1];
  };
}

export function getDefaultOptions() {
  return fromEntries(
    Z_DeviceOptions.options.map((obj) => [
      obj.shape.driverName.value,
      Z_getDefaults(obj.shape.options),
    ]),
  );
}

export type DeviceOptions = z.input<typeof Z_DeviceOptions>;

export type DeviceStatus = "Connected" | "Reconnecting" | "Disabled";
export class Device {
  name: string;
  driver: ModbusTCPDriver | OpcuaClientDriver;
  options: DeviceOptions;

  constructor(opcuaServer: OPCUAServer, opts: DeviceOptions) {
    const config = Z_DeviceOptions.parse(opts);

    this.name = config.name;
    this.options = config;

    if (config.driverName === "ModbusTCPDriver") {
      this.driver = new ModbusTCPDriver(opcuaServer, config.options);
    } else if (config.driverName === "ModbusRTUDriver") {
      throw new Error("[Device] ModbusRTU driver Not implimented yet");
    } else if (config.driverName === "opcuaClientDriver") {
      this.driver = new OpcuaClientDriver(opcuaServer, config.options);
    } else {
      throw new Error(`[Device] invalid driver name`);
    }

    if (this.options.enabled) this.driver.connect();
  }

  [Symbol.dispose]() {
    this.dispose();
  }

  dispose() {
    this.disable();
    this.driver.dispose();
    logger.trace(`[Device] dispose() ${this.name}`);
  }

  enable() {
    this.options.enabled = true;
    this.driver.connect();
  }

  disable() {
    this.options.enabled = false;
    this.driver.disconnect();
  }

  get status(): DeviceStatus {
    if (this.options.enabled) {
      return this.driver.connected ? "Connected" : "Reconnecting";
    } else {
      return "Disabled";
    }
  }

  getOptionsAndStatus() {
    const status = this.status;
    return { ...this.options, status };
  }

  tagSubscribed(tag: Tag<any>, parent?: NodeIdLike) {
    return this.driver.subscribeByTag(tag, parent);
  }

  tagUnsubscribed(tag: Tag<any>) {
    this.driver.unsubscribeByTag(tag);
  }
}

export class DeviceManager {
  private devices: Map<string, Device>;
  opcuaServer?: OPCUAServer;

  constructor() {
    this.devices = new Map();
  }

  initOpcuaServer(server: OPCUAServer) {
    this.opcuaServer = server;
  }

  async loadAllFromDb() {
    let devices = await collections.devices.find().toArray();

    if (!this.opcuaServer) {
      throw new Error(
        `[DeviceManager] loadAllFromDb() failed, no opcuaServer defined  please call initOpcuaServer() first`,
      );
    }

    for (const device of devices) {
      const { _id, ...deviceWithoutId } = device;
      // TD typscript error about this.opcuaServer possibly being undefined because im using attempt(() => {})
      const { data, error } = await attempt(() =>
        this.addDevice(new Device(this.opcuaServer, deviceWithoutId), false),
      );
      if (error) logger.error(error);
    }
  }

  async addDevice(device: Device, writeToDb: boolean = true) {
    this.devices.set(device.name, device);
    if (writeToDb) {
      const { error, data } = await attempt(() =>
        collections.devices.updateOne(
          { name: device.name },
          { $set: { ...device.options } },
          { upsert: true },
        ),
      );
      if (error) {
        logger.error(error);
      }
    }
    logger.info(`[DeviceManager] added device ${device.name}`);
    return device;
  }

  async removeDevice(deviceName: string) {
    const oldDevice = this.devices.get(deviceName);
    oldDevice?.dispose();
    this.devices.delete(deviceName);
    const { error, data } = await attempt(() =>
      collections.devices.deleteOne({ name: deviceName }),
    );
    if (error) {
      logger.error(error);
    }
    logger.info(`[DeviceManager] removed device ${deviceName}`);
  }

  async updateDevice(deviceOptions: DeviceOptions, writeToDb: boolean = true) {
    let oldDevice = this.devices.get(deviceOptions.name);
    if (oldDevice) {
      await this.removeDevice(deviceOptions.name);
    }

    if (!this.opcuaServer) {
      throw new Error(
        `[DeviceManager] updateDevice() this.opcuaServer undefined, please call initOpcuaServer() first`,
      );
    }
    const newDevice = await this.addDevice(
      new Device(this.opcuaServer, deviceOptions),
      writeToDb,
    );

    for (const tag of tagManager.getAllTags()) {
      if (tag.resolvedOptions.nodeId) {
        const resolved = resolveOpcuaPath(tag.resolvedOptions.nodeId);
        if (resolved.deviceName == newDevice.name) {
          tag.subscribeToDriver();
        }
      }
    }

    logger.info(`[DeviceManager] updated device ${deviceOptions.name}`);
    return newDevice;
  }

  getDevice(deviceName: string) {
    return this.devices.get(deviceName);
  }

  getAllDevices() {
    return this.devices.values().toArray() ?? [];
  }

  getDeviceFromPath(path: string): Device {
    const device = this.devices.get(path);
    if (!device) throw new Error(`[DeviceManager] Device at ${path} not found`);
    return device;
  }

  getAvalibleDevices() {
    return this.devices.keys();
  }
}
