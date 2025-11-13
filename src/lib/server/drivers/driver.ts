import type { NodeIdLike, OPCUAServer, StatusCode } from "node-opcua";
import {
  ModbusTCPDriver,
  Z_ModbusTCPDriverOptions,
  type TagSubscription,
} from "./modbus/modbusTcp";
import { Z_ModbusRTUDriverOptions } from "./modbus/modbusRtu";
import { z } from "zod";
import { logger } from "../pino/logger";
import { collections } from "../mongodb/collections";
import { attempt } from "../../../lib/util/attempt";
import { resolveOpcuaPath, Tag } from "../tag/tag";
import { tagManager } from "../../../server";

export type AvalibleDriver = {
  id: string; // internal name must match class name
  displayName: string; // UI string
};

// Single source of truth
export const avalibeDrivers: AvalibleDriver[] = [
  { id: "ModbusTCPDriver", displayName: "Modbus TCP/IP Driver" },
  { id: "otherDriver", displayName: "Other Protocol" },
] as const;

// Extract the type of valid driver IDsdevice
export type DriverId = (typeof avalibeDrivers)[number]["id"];

export function isValidDriver(id: string): id is DriverId {
  return avalibeDrivers.some((driver) => driver.id === id);
}

export class DriverStatusError extends Error {
  opcuaStatus: StatusCode;
  message: string;
  constructor(opcuaStatus: StatusCode, message: string) {
    super(message);
    this.message = message;
    this.opcuaStatus = opcuaStatus;
  }
}

export const Z_DeviceOptions = z.discriminatedUnion("driverName", [
  z.object({
    name: z.string().nonempty(),
    driverName: z.literal("ModbusTCPDriver"),
    options: Z_ModbusTCPDriverOptions,
    enabled: z.coerce.boolean<boolean>(),
  }),
  z.object({
    name: z.string().nonempty(),
    driverName: z.literal("ModbusRTUDriver"),
    options: Z_ModbusRTUDriverOptions,
    enabled: z.coerce.boolean<boolean>(),
  }),
]);

export type DeviceOptions = z.input<typeof Z_DeviceOptions>;

export type DeviceStatus = "Connected" | "Reconnecting" | "Disabled";
export class Device {
  name: string;
  driver: ModbusTCPDriver;
  options: DeviceOptions;

  constructor(opcuaServer: OPCUAServer, opts: DeviceOptions) {
    const config = Z_DeviceOptions.parse(opts);

    this.name = config.name;
    this.options = config;

    if (config.driverName === "ModbusTCPDriver") {
      this.driver = new ModbusTCPDriver(opcuaServer, config.options);
    } else if (config.driverName === "ModbusRTUDriver") {
      throw new Error("[Device] ModbusRTU driver Not implimented yet");
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

  tagSubscribed(tag: Tag<any>, parent?: NodeIdLike) {
    return this.driver.subscribeByNodeId(tag, parent);
  }

  tagUnsubscribed(nodeId: string) {
    this.driver.unsubscribeByNodeId(nodeId);
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
        `[DeviceManager] loadAllFromDb() failed, no opcuaServer defined  please call initOpcuaServer() first`
      );
    }

    for (const device of devices) {
      const { _id, ...deviceWithoutId } = device;
      // TD typscript error about this.opcuaServer possibly being undefined because im using attempt(() => {})
      const { data, error } = await attempt(() =>
        // @ts-ignore
        this.addDevice(new Device(this.opcuaServer, deviceWithoutId), false)
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
          { upsert: true }
        )
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
      collections.devices.deleteOne({ name: deviceName })
    );
    if (error) {
      logger.error(error);
    }
    logger.debug(`[DeviceManager] removed device ${deviceName}`);
  }

  async updateDevice(device: Device, writeToDb: boolean = true) {
    let oldDevice = this.devices.get(device.name);
    if (oldDevice) {
      await this.removeDevice(device.name);
    }

    const newDevice = await this.addDevice(device, writeToDb);

    for (const tag of tagManager.getAllTags()) {
      if (tag.nodeId) {
        const resolved = resolveOpcuaPath(tag.nodeId);
        if (resolved.deviceName == newDevice.name) {
          tag.subscribeToDriver();
        }
      }
    }

    logger.info(`[DeviceManager] updated device ${device.name}`);
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
