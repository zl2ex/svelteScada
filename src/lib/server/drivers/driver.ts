import type { BaseNode, NodeIdLike, OPCUAServer, UAVariable } from "node-opcua";
import {
  ModbusTCPDriver,
  Z_ModbusTCPDriverOptions,
  type ModbusTCPDriverOptions,
} from "./modbus/modbusTcp";
import { z } from "zod";
import { Z_ModbusRTUDriverOptions } from "./modbus/modbusRtu";
import { logger } from "../pino/logger";

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
    enabled: z.boolean().optional().default(true),
  }),
  z.object({
    name: z.string(),
    driverName: z.literal("ModbusRTUDriver"),
    options: Z_ModbusRTUDriverOptions,
    enabled: z.boolean().optional().default(true),
  }),
]);

export type DeviceOptions = z.input<typeof Z_DeviceOptions>;
export class Device {
  name: string;
  enabled: boolean;
  driver: ModbusTCPDriver;

  constructor(opcuaServer: OPCUAServer, opts: DeviceOptions) {
    const config = Z_DeviceOptions.parse(opts);

    this.name = config.name;
    this.enabled = config.enabled;

    if (config.driverName === "ModbusTCPDriver") {
      this.driver = new ModbusTCPDriver(opcuaServer, config.options);
    } else if (config.driverName === "ModbusRTUDriver") {
      throw new Error("[Device] ModbusRTU driver Not implimented yet");
    } else {
      throw new Error(`[Device] invalid driver name`);
    }

    if (this.enabled) this.driver.connect();
  }

  tagSubscribed(path: string, parent?: BaseNode | NodeIdLike) {
    return this.driver?.subscribeByPath(path, parent);
  }

  tagUnsubscribed(path: string) {
    // TD WIP
    throw new Error("TD WIP Unsibscribe");
  }
}

export class DeviceManager {
  private devices: Map<string, Device>;
  constructor() {
    this.devices = new Map();
  }

  addDevice(device: Device) {
    this.devices.set(device.name, device);
    logger.debug(`[DeviceManager] added device ${device.name}`, device);
  }

  removeDevice(deviceName: string) {
    this.devices.delete(deviceName);
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
