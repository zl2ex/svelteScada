import type { NodeIdLike, OPCUAServer, StatusCode } from "node-opcua";
import { ModbusTCPDriver, Z_ModbusTCPDriverOptions } from "./modbus/modbusTcp";
import { Z_ModbusRTUDriverOptions } from "./modbus/modbusRtu";
import { z } from "zod";
import { logger } from "$lib/server/pino/logger";
import { attempt } from "$lib/util/attempt";
import { resolveOpcuaPath, Tag } from "$lib/server/tag/tag";
import {
  OpcuaClientDriver,
  Z_OpcuaClientDriverOptions,
} from "./opcua/opcuaClient";
import { tagManager } from "../../../hooks.server";
import { db } from "../sqlite/db";
import {
  devices,
  device_modbus_tcp_options,
  device_modbus_rtu_options,
  device_opcua_client_options,
  z_insertDevice,
  z_insertDeviceModbusTcpOptions,
  z_insertDeviceModbusRtuOptions,
  z_insertDeviceOpcuaClientOptions,
} from "../sqlite/tables";
import { eq } from "drizzle-orm";

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
export const z_DeviceOptions = z.discriminatedUnion("driverName", [
  z_insertDevice.extend({
    driverName: z.literal("ModbusTCPDriver"),
    displayName: z.literal("Modbus TCP/IP Driver"),
    options: z_insertDeviceModbusTcpOptions,
  }),
  z_insertDevice.extend({
    driverName: z.literal("ModbusRTUDriver"),
    displayName: z.literal("Modbus RTU Driver"),
    options: z_insertDeviceModbusRtuOptions,
  }),
  z_insertDevice.extend({
    driverName: z.literal("opcuaClientDriver"),
    displayName: z.literal("Opcua Client Driver"),
    options: z_insertDeviceOpcuaClientOptions,
  }),
]);

export type AvalibleDriver = {
  id: string; // internal name must match class name
  displayName: string; // UI string
};

export const avalibeDrivers: AvalibleDriver[] = z_DeviceOptions.options.map(
  (obj) => {
    return {
      id: obj.shape.driverName.value,
      displayName: obj.shape.displayName.value, // TD WIP avalibeDrivers Might not work
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
    z_DeviceOptions.options.map((obj) => [
      obj.shape.driverName.value,
      Z_getDefaults(obj.shape.options),
    ]),
  );
}

export type DeviceOptions = z.input<typeof z_DeviceOptions>;

export type DeviceStatus = "Connected" | "Reconnecting" | "Disabled";
export class Device {
  name: string;
  driver: ModbusTCPDriver | OpcuaClientDriver;
  options: DeviceOptions;

  constructor(opcuaServer: OPCUAServer, opts: DeviceOptions) {
    const config = z_DeviceOptions.parse(opts);

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
    const rows = await db.query.devices.findMany({
      with: {
        device_modbus_tcp_options: true,
        device_modbus_rtu_options: true,
        device_opcua_client_options: true,
      },
    });

    if (!this.opcuaServer) {
      throw new Error(
        `[DeviceManager] loadAllFromDb() failed, no opcuaServer defined  please call initOpcuaServer() first`,
      );
    }

    let deviceCount = 0;

    for (const row of rows) {
      let driverOptions;
      if (
        row.driverName === "ModbusTCPDriver" &&
        row.device_modbus_tcp_options
      ) {
        driverOptions = row.device_modbus_tcp_options;
      } else if (
        row.driverName === "ModbusRTUDriver" &&
        row.device_modbus_rtu_options
      ) {
        driverOptions = row.device_modbus_rtu_options;
      } else if (
        row.driverName === "opcuaClientDriver" &&
        row.device_opcua_client_options
      ) {
        driverOptions = row.device_opcua_client_options;
      }

      const deviceOptions = {
        name: row.name,
        driverName: row.driverName,
        displayName: row.displayName ?? undefined,
        enabled: row.enabled,
        options: driverOptions,
      } as DeviceOptions;

      const { data, error } = await attempt(() =>
        this.addDevice(new Device(this.opcuaServer, deviceOptions), false),
      );
      if (error) logger.error(error);
      if (data) deviceCount++;
    }
    logger.debug(`[DeviceManager] loaded ${deviceCount} devices from database`);
  }

  async addDevice(device: Device, writeToDb: boolean = true) {
    this.devices.set(device.name, device);
    if (writeToDb) {
      const { error } = attempt(() => {
        const [inserted] = db
          .insert(devices)
          .values(device.options)
          .onConflictDoUpdate({
            target: devices.id,
            set: device.options,
          })
          .returning()
          .all();

        const deviceId = inserted.id;
        const opts = device.options.options;

        if (device.options.driverName === "ModbusTCPDriver") {
          db.insert(device_modbus_tcp_options)
            .values(opts)
            .onConflictDoUpdate({
              target: device_modbus_tcp_options.deviceId,
              set: opts,
            })
            .run();
        } else if (device.options.driverName === "ModbusRTUDriver") {
          db.insert(device_modbus_rtu_options)
            .values(opts)
            .onConflictDoUpdate({
              target: device_modbus_rtu_options.deviceId,
              set: opts,
            })
            .run();
        } else if (device.options.driverName === "opcuaClientDriver") {
          db.insert(device_opcua_client_options)
            .values(opts)
            .onConflictDoUpdate({
              target: device_opcua_client_options.deviceId,
              set: opts,
            })
            .run();
        }
      });
      if (error) logger.error(error);
    }
    logger.info(`[DeviceManager] added device ${device.name}`);
    return device;
  }

  async removeDevice(deviceName: string) {
    const oldDevice = this.devices.get(deviceName);
    oldDevice?.dispose();
    this.devices.delete(deviceName);
    const { error } = await attempt(() =>
      db.delete(devices).where(eq(devices.name, deviceName)).run(),
    );
    if (error) logger.error(error);
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
