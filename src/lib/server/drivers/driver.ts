import type { NodeIdLike, OPCUAServer, StatusCode } from "node-opcua";
import { ModbusTCPDriver } from "./modbus/modbusTcp";
import { ModbusRTUDriver } from "./modbus/modbusRtu";
import { z } from "zod";
import { err, ok, ResultAsync, type Result } from "neverthrow";
import type { NeverThrowError } from "$lib/util/neverThrow";
import { logger } from "$lib/server/pino/logger";
import { attempt } from "$lib/util/attempt";
import {
  resolveOpcuaPath,
  Tag,
  type BaseTypeMap,
  type BaseTypeStrings,
} from "$lib/server/tag/tag";
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

/** What a subscriber sees: the last good value (kept while bad) plus a status. */
export type Reading<T> = { value: T; status: StatusCode };

export interface DriverVariable<T> {
  /** Latest cached reading. */
  readonly reading: Reading<T>;
  /**
   * Calls `cb` immediately with the cached reading, then whenever the value or
   * status changes. Returns an unsubscribe function.
   */
  onChange(cb: (reading: Reading<T>) => void): () => void;
  /** Resolves once the device accepted the write. */
  write(value: T): ResultAsync<void, NeverThrowError>;
  /** Drops this handle. When the last handle on an address is released it stops being polled. */
  release(): void;
}

export type SubscribeOptions = {
  /** Length in bytes. Required for `String`. */
  stringLength?: number;
};

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
    displayName: z
      .literal("Modbus TCP/IP Driver")
      .default("Modbus TCP/IP Driver"),
    options: z_insertDeviceModbusTcpOptions,
  }),
  z_insertDevice.extend({
    driverName: z.literal("ModbusRTUDriver"),
    displayName: z.literal("Modbus RTU Driver").default("Modbus RTU Driver"),
    options: z_insertDeviceModbusRtuOptions,
  }),
  z_insertDevice.extend({
    driverName: z.literal("opcuaClientDriver"),
    displayName: z
      .literal("Opcua Client Driver")
      .default("Opcua Client Driver"),
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
  // TD WIP
  driver: ModbusTCPDriver; // | ModbusRTUDriver | OpcuaClientDriver;
  options: DeviceOptions;

  private constructor(
    config: DeviceOptions,
    driver: ModbusTCPDriver | ModbusRTUDriver | OpcuaClientDriver,
  ) {
    this.name = config.name;
    this.options = config;
    this.driver = driver;
  }

  static create(opts: DeviceOptions) {
    const parsed = z_DeviceOptions.safeParse(opts);
    if (!parsed.success) {
      return err({
        reason: "OPTIONS_PARSE_ERROR",
        cause: `[Device] create() failed to parse device options: ${parsed.error.message}`,
      } as const satisfies NeverThrowError);
    }
    const config = parsed.data;

    // TD WIP FORCE MODBUSTCP

    let driver: ModbusTCPDriver; //  | ModbusRTUDriver | OpcuaClientDriver;
    config.driverName = "ModbusTCPDriver";
    if (config.driverName === "ModbusTCPDriver") {
      const created = ModbusTCPDriver.create(config.options);
      if (created.isErr()) {
        return err({
          reason: "DRIVER_CREATE_ERROR",
          cause: `[Device] create() failed to create ModbusTCPDriver: ${JSON.stringify(created.error)}`,
        } as const satisfies NeverThrowError);
      }
      driver = created.value;
    } else if (config.driverName === "ModbusRTUDriver") {
      const created = ModbusRTUDriver.create(opcuaServer, config.options);
      if (created.isErr()) {
        return err({
          reason: "DRIVER_CREATE_ERROR",
          cause: `[Device] create() failed to create ModbusRTUDriver: ${JSON.stringify(created.error)}`,
        } as const satisfies NeverThrowError);
      }
      driver = created.value;
    } else if (config.driverName === "opcuaClientDriver") {
      const opcuaParsed = Z_OpcuaClientDriverOptions.safeParse(config.options);
      if (!opcuaParsed.success) {
        return err({
          reason: "OPTIONS_PARSE_ERROR",
          cause: `[Device] create() failed to parse opcuaClientDriver options: ${opcuaParsed.error.message}`,
        } as const satisfies NeverThrowError);
      }
      driver = new OpcuaClientDriver(opcuaServer, opcuaParsed.data);
    } else {
      return err({
        reason: "INVALID_DRIVER_NAME",
        cause: `[Device] create() invalid driver name`,
      } as const satisfies NeverThrowError);
    }

    const device = new Device(config, driver);
    if (device.options.enabled) device.driver.connect();
    return ok(device);
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

  subscribe(path: string, dataType: BaseTypeStrings) {
    return this.driver.subscribe(path, dataType);
  }
}

export class DeviceManager {
  private devices: Map<string, Device>;

  constructor() {
    this.devices = new Map();
  }

  async loadAllFromDb() {
    const rows = await db.query.devices.findMany({
      with: {
        device_modbus_tcp_options: true,
        device_modbus_rtu_options: true,
        device_opcua_client_options: true,
      },
    });

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

      if (!driverOptions) {
        throw Error(
          `[DeviceManager] loadAllFromDb() failed, no driver options provided for ${row.name}  ${row.driverName}`,
        );
      }

      const deviceOptions = {
        name: row.name,
        driverName: row.driverName,
        enabled: row.enabled,
        options: driverOptions,
      } as DeviceOptions;

      const created = Device.create(deviceOptions);
      if (created.isErr()) {
        logger.error(created.error);
        continue;
      }

      const added = this.addDevice(created.value, false);
      if (added.isErr()) {
        logger.error(added.error);
        continue;
      }
      deviceCount++;
    }
    logger.debug(`[DeviceManager] loaded ${deviceCount} devices from database`);
    return ok(undefined);
  }

  addDevice(device: Device, writeToDb: boolean = true) {
    if (this.devices.has(device.name)) {
      return err({
        reason: "DEVICE_ALREADY_EXISTS",
        cause: `[DeviceManager] addDevice() device ${device.name} already exists`,
      } as const satisfies NeverThrowError);
    }

    if (writeToDb) {
      const dbWrite = attempt(() => {
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
      if (dbWrite.error) {
        return err({
          reason: "DB_ERROR",
          cause: `[DeviceManager] addDevice() failed to write device ${device.name} to database: ${
            dbWrite.error instanceof Error
              ? dbWrite.error.message
              : String(dbWrite.error)
          }`,
        } as const satisfies NeverThrowError);
      }
    }

    this.devices.set(device.name, device);
    logger.info(`[DeviceManager] added device ${device.name}`);
    return ok(device);
  }

  removeDevice(deviceName: string) {
    const oldDevice = this.devices.get(deviceName);
    if (!oldDevice) {
      return err({
        reason: "DEVICE_NOT_FOUND",
        cause: `[DeviceManager] removeDevice() device ${deviceName} not found`,
      } as const satisfies NeverThrowError);
    }

    const dbDelete = attempt(() =>
      db.delete(devices).where(eq(devices.name, deviceName)).run(),
    );
    if (dbDelete.error) {
      return err({
        reason: "DB_ERROR",
        cause: `[DeviceManager] removeDevice() failed to delete device ${deviceName} from database: ${
          dbDelete.error instanceof Error
            ? dbDelete.error.message
            : String(dbDelete.error)
        }`,
      } as const satisfies NeverThrowError);
    }

    oldDevice.dispose();
    this.devices.delete(deviceName);
    logger.info(`[DeviceManager] removed device ${deviceName}`);
    return ok(undefined);
  }

  updateDevice(deviceOptions: DeviceOptions, writeToDb: boolean = true) {
    const oldDevice = this.devices.get(deviceOptions.name);
    if (oldDevice) {
      const removed = this.removeDevice(deviceOptions.name);
      if (removed.isErr()) return err(removed.error);
    }

    const created = Device.create(deviceOptions);
    if (created.isErr()) {
      return err({
        reason: "DEVICE_CREATE_FAILED",
        cause: `[DeviceManager] updateDevice() failed to create device: ${created.error.reason}`,
      } as const satisfies NeverThrowError);
    }

    const added = this.addDevice(created.value, writeToDb);
    if (added.isErr()) return err(added.error);

    for (const tag of tagManager.getAllTags()) {
      if (!(tag instanceof Tag)) continue; // skip tags that failed to load
      if (tag.options.nodeId) {
        const resolved = resolveOpcuaPath(tag.options.nodeId);
        if (resolved.deviceName == added.value.name) {
          tag.subscribeToDriver();
        }
      }
    }

    logger.info(`[DeviceManager] updated device ${deviceOptions.name}`);
    return ok(added.value);
  }

  getDevice(deviceName: string) {
    return this.devices.get(deviceName);
  }

  getAllDevices() {
    return this.devices.values().toArray() ?? [];
  }

  getDeviceFromPath(path: string) {
    const device = this.devices.get(path);
    if (!device)
      return err({
        reason: "DEVICE_NOT_FOUND",
        cause: `[DeviceManager] Device at ${path} not found`,
      } as const satisfies NeverThrowError);
    return ok(device);
  }

  getAvalibleDevices() {
    return this.devices.keys();
  }
}
