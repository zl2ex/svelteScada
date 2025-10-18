import type { NodeIdLike, OPCUAServer } from "node-opcua";
import { ModbusTCPDriver, Z_ModbusTCPDriverOptions } from "./modbus/modbusTcp";
import { Z_ModbusRTUDriverOptions } from "./modbus/modbusRtu";
import { symbol, z } from "zod";
import { logger } from "../pino/logger";
import { collections } from "../mongodb/collections";
import { attempt } from "../../../lib/util/attempt";

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

export const Z_DeviceOptions = z.discriminatedUnion("driverName", [
  z.object({
    name: z.string(),
    driverName: z.literal("ModbusTCPDriver"),
    options: Z_ModbusTCPDriverOptions,
    enabled: z.coerce.boolean<boolean>(),
  }),
  z.object({
    name: z.string(),
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

  tagSubscribed(path: string, parent?: NodeIdLike) {
    return this.driver?.subscribeByPath(path, parent);
  }

  tagUnsubscribed(path: string) {
    // TD WIP
    throw new Error("TD WIP Unsibscribe");
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
      const { data, error } = await attempt(() =>
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
