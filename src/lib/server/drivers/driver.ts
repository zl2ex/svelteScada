import type { StatusCode } from "node-opcua";
import {
  ModbusTCPDriver,
  type ModbusTCPDriverOptions,
} from "./modbus/modbusTcp";
import {
  ModbusRTUDriver,
  type ModbusRTUDriverOptions,
} from "./modbus/modbusRtu";
import { z } from "zod";
import { err, ok, type Result } from "neverthrow";
import {
  errorToString,
  neverThrowErrorToString,
  type NeverThrowError,
} from "$lib/util/neverThrow";
import { logger } from "$lib/server/pino/logger";
import { attempt } from "$lib/util/attempt";
import {
  resolveOpcuaPath,
  Tag,
  type BaseTypeStrings,
} from "$lib/server/tag/tag";
import {
  OpcuaClientDriver,
  Z_OpcuaClientDriverOptions,
  type OpcuaClientDriverOptions,
} from "./opcua/opcuaClient";
import { tagManager } from "../../../hooks.server";
import { publishDeviceStatus } from "../../../live/devices";
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

export type DriverWriteError = NeverThrowError & {
  opcuaStatus: StatusCode;
};

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
  write(value: T): Promise<Result<void, DriverWriteError>>;
  /** Drops this handle. When the last handle on an address is released it stops being polled. */
  release(): void;
}

export type SubscribeOptions = {
  /** Length in bytes. Required for `String`. */
  stringLength?: number;
};

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
      displayName: obj.shape.displayName.def.defaultValue,
    };
  },
);

// Extract the type of valid driver IDsdevice
export type DriverId = (typeof avalibeDrivers)[number]["id"];

export function isValidDriver(id: string): id is DriverId {
  return avalibeDrivers.some((driver) => driver.id === id);
}

export type DeviceOptions = z.input<typeof z_DeviceOptions>;

export type DeviceStatus = "Error" | "Connected" | "Reconnecting" | "Disabled";

export type FailedDevice = NeverThrowError & {
  options: DeviceOptions;
};

type DeviceStatusListener = (status: DeviceStatus) => void;

export class Device {
  id: string;
  name: string;
  options: DeviceOptions;
  // TD WIP
  private driver: ModbusTCPDriver; // | ModbusRTUDriver | OpcuaClientDriver;
  /** fired whenever the driver connection state changes */
  private driverUnsubscribe?: () => void;
  /** fired whenever `status` changes, see onChange() */
  private statusListeners = new Set<DeviceStatusListener>();

  private constructor(
    config: DeviceOptions,
    driver: ModbusTCPDriver | ModbusRTUDriver | OpcuaClientDriver,
  ) {
    this.name = config.name;
    // create new instance id
    this.id = config.id;
    this.options = config;
    this.driver = driver;
    // the driver is the source of truth for connection state, mirror it up
    this.driverUnsubscribe = driver.onConnectedChange(() =>
      this.refreshStatus(),
    );
  }

  static create(options: DeviceOptions) {
    const parsed = z_DeviceOptions.safeParse(options);
    if (!parsed.success) {
      return err({
        reason: "OPTIONS_PARSE_ERROR",
        cause: `[Device] create() failed to parse device options: ${parsed.error.message}`,
        options,
      } as const satisfies FailedDevice);
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
          options,
        } as const satisfies FailedDevice);
      }
      driver = created.value;
    } else if (config.driverName === "ModbusRTUDriver") {
      const created = ModbusRTUDriver.create(config.options);
      if (created.isErr()) {
        return err({
          reason: "DRIVER_CREATE_ERROR",
          cause: `[Device] create() failed to create ModbusRTUDriver: ${JSON.stringify(created.error)}`,
          options,
        } as const satisfies FailedDevice);
      }
      driver = created.value;
    } else if (config.driverName === "opcuaClientDriver") {
      const opcuaParsed = Z_OpcuaClientDriverOptions.safeParse(config.options);
      if (!opcuaParsed.success) {
        return err({
          reason: "OPTIONS_PARSE_ERROR",
          cause: `[Device] create() failed to parse opcuaClientDriver options: ${opcuaParsed.error.message}`,
          options,
        } as const satisfies FailedDevice);
      }
      driver = new OpcuaClientDriver(opcuaParsed.data);
    } else {
      return err({
        reason: "INVALID_DRIVER_NAME",
        cause: `[Device] create() invalid driver name`,
        options,
      } as const satisfies FailedDevice);
    }

    const device = new Device(config, driver);
    if (device.options.enabled) {
      const connected = device.driver.connect();
      if (connected.isErr()) {
        logger.error(
          `[Device] create() ${neverThrowErrorToString(connected.error)}`,
        );
      }
    }
    return ok(device);
  }

  [Symbol.dispose]() {
    this.dispose();
  }

  dispose() {
    this.disable();
    this.driverUnsubscribe?.();
    this.driverUnsubscribe = undefined;
    this.statusListeners.clear();
    this.driver.dispose();
    logger.trace(`[Device] dispose() ${this.name}`);
  }

  enable() {
    this.options.enabled = true;
    const connected = this.driver.connect();
    if (connected.isErr()) {
      logger.error(
        `[Device] enable() ${this.name} ${neverThrowErrorToString(connected.error)}`,
      );
    }
    this.refreshStatus();
  }

  disable() {
    this.options.enabled = false;
    const disconnected = this.driver.disconnect();
    if (disconnected.isErr()) {
      logger.error(
        `[Device] disable() ${this.name} ${neverThrowErrorToString(disconnected.error)}`,
      );
    }
    this.refreshStatus();
  }

  get status(): DeviceStatus {
    return this.computeStatus();
  }

  private computeStatus(): DeviceStatus {
    if (this.options.enabled) {
      return this.driver.connected ? "Connected" : "Reconnecting";
    } else {
      return "Disabled";
    }
  }

  /** recompute the status and notify listeners */
  private refreshStatus() {
    const stauts = this.computeStatus();
    for (const cb of this.statusListeners) {
      try {
        cb(stauts);
      } catch (e) {
        logger.error(
          e,
          `[Device] status listener for ${this.id} ${this.name} threw`,
        );
      }
    }
  }

  /**
   * Subscribe to status changes. Called once immediately with the current
   * status, then on every change. Returns an unsubscribe function.
   */
  onStatusChange(cb: DeviceStatusListener) {
    const entry: DeviceStatusListener = (status) => cb(status);
    this.statusListeners.add(entry);
    entry(this.computeStatus());
    return () => {
      this.statusListeners.delete(entry);
    };
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
  private devices: Map<string, Result<Device, FailedDevice>>;

  constructor() {
    this.devices = new Map();
  }

  /**
   * Mirror device status changes to the front end. The driver owns the
   * connection state, Device fans it out through onStatusChange() and we publish.
   */
  private trackStatus(device: Result<Device, FailedDevice>) {
    if (device.isErr()) return;
    const created = device.value;
    created.onStatusChange((status) => publishDeviceStatus(created.id, status));
  }

  async loadAllFromDb() {
    const found = await attempt(() =>
      db.query.devices.findMany({
        with: {
          device_modbus_tcp_options: true,
          device_modbus_rtu_options: true,
          device_opcua_client_options: true,
        },
      }),
    );
    if (found.error) {
      return err({
        reason: "DB_ERROR",
        cause: `[DeviceManager] loadAllFromDb() failed to read devices: ${errorToString(
          found.error,
        )}`,
      } as const satisfies NeverThrowError);
    }
    const rows = found.data;

    let deviceCount = 0;

    for (const row of rows) {
      let driverOptions:
        | ModbusTCPDriverOptions
        | ModbusRTUDriverOptions
        | OpcuaClientDriverOptions
        | undefined;
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
        logger.error(
          `[DeviceManager] loadAllFromDb() failed, no driver options provided for ${row.id} ${row.name}  ${row.driverName}`,
        );
        continue;
      }

      const deviceOptions = {
        ...row,
        options: driverOptions,
      } as DeviceOptions;

      const device = Device.create(deviceOptions);

      this.devices.set(row.id, device);
      this.trackStatus(device);
      deviceCount++;
    }
    logger.debug(`[DeviceManager] loaded ${deviceCount} devices from database`);
    return ok(true);
  }

  addDevice(options: DeviceOptions) {
    if (this.devices.has(options.id)) {
      return err({
        reason: "DEVICE_ALREADY_EXISTS",
        cause: `[DeviceManager] addDevice() device ${options.id} ${options.name} already exists`,
        options,
      } as const satisfies FailedDevice);
    }

    const dbWrite = attempt(() => {
      db.insert(devices)
        .values(options)
        .onConflictDoUpdate({
          target: devices.id,
          set: options,
        })
        .returning()
        .all();

      const driverOptions = { ...options.options, deviceId: options.id };

      if (options.driverName === "ModbusTCPDriver") {
        db.insert(device_modbus_tcp_options)
          .values(driverOptions)
          .onConflictDoUpdate({
            target: device_modbus_tcp_options.deviceId,
            set: driverOptions,
          })
          .run();
      } else if (options.driverName === "ModbusRTUDriver") {
        db.insert(device_modbus_rtu_options)
          .values(driverOptions)
          .onConflictDoUpdate({
            target: device_modbus_rtu_options.deviceId,
            set: driverOptions,
          })
          .run();
      } else if (options.driverName === "opcuaClientDriver") {
        db.insert(device_opcua_client_options)
          .values(driverOptions)
          .onConflictDoUpdate({
            target: device_opcua_client_options.deviceId,
            set: driverOptions,
          })
          .run();
      }

      return deviceId;
    });

    if (dbWrite.error) {
      return err({
        reason: "DB_ERROR",
        cause: `[DeviceManager] addDevice() failed to write device ${options.name} to database: ${errorToString(
          dbWrite.error,
        )}`,
      } as const satisfies NeverThrowError);
    }

    const device = Device.create(options);

    this.devices.set(options.id, device);
    this.trackStatus(device);
    logger.info(`[DeviceManager] added device ${options.id} ${options.name}`);
    if (device.isErr()) return err(device.error);
    return ok(device.value);
  }

  removeDevice(id: string) {
    const oldDevice = this.devices.get(id);
    if (!oldDevice) {
      return err({
        reason: "DEVICE_NOT_FOUND",
        cause: `[DeviceManager] removeDevice() device at ${id} not found`,
      } as const satisfies NeverThrowError);
    }

    const dbDelete = attempt(() =>
      db.delete(devices).where(eq(devices.id, id)).run(),
    );
    if (dbDelete.error) {
      return err({
        reason: "DB_ERROR",
        cause: `[DeviceManager] removeDevice() failed to delete device ${id} from database: ${errorToString(
          dbDelete.error,
        )}`,
      } as const satisfies NeverThrowError);
    }

    if (oldDevice.isOk()) oldDevice.value.dispose();
    this.devices.delete(id);
    logger.info(`[DeviceManager] removed device ${id}`);
    return ok(true);
  }

  updateDevice(id: string, options: DeviceOptions) {
    const dbWrite = attempt(() => {
      db.insert(devices)
        .values(options)
        .onConflictDoUpdate({
          target: devices.id,
          set: options,
        })
        .returning()
        .all();
    });

    if (dbWrite.error) {
      return err({
        reason: "DB_ERROR",
        cause: `[DeviceManager] addDevice() failed to write device ${id} ${options.name} to database: ${errorToString(
          dbWrite.error,
        )}`,
      } as const satisfies NeverThrowError);
    }

    const oldDevice = this.devices.get(id);
    if (oldDevice) {
      if (oldDevice.isOk()) oldDevice.value.dispose();
      this.devices.delete(id);
    }

    const newDevice = Device.create(options);
    if (newDevice.isErr()) return err(newDevice.error);
    this.devices.set(id, newDevice);
    this.trackStatus(newDevice);

    for (const tag of tagManager.getAllTags()) {
      throw Error("TD WIP FIX THIS [DeviceManager] loadAllFromDb()");
      if (!(tag instanceof Tag)) continue; // skip tags that failed to load
      if (tag.options.nodeId) {
        const resolved = resolveOpcuaPath(tag.options.nodeId);
        if (resolved.deviceName == newDevice.value.name) {
          tag.subscribeToDriver();
        }
      }
    }

    logger.info(`[DeviceManager] updated device ${id} ${options.name}`);
    return ok(newDevice.value);
  }

  getDevice(id: string) {
    return this.devices.get(id);
  }

  getAllDevices() {
    return this.devices.values().toArray() ?? [];
  }

  getDeviceByName(name: string) {
    const [k, device] =
      this.devices.entries().find(([key, device]) => {
        const testName = device.isOk()
          ? device.value.name
          : device.error.options.name;
        return name === testName;
      }) ?? [];
    if (!device) {
      return err({
        reason: "DEVICE_NOT_FOUND",
        cause: `[DeviceManager] Device at ${name} not found`,
      } as const satisfies NeverThrowError);
    }
    if (device.isErr()) return err(device.error);
    return ok(device.value);
  }

  getAvalibleDevices() {
    return this.devices
      .values()
      .map((device) =>
        device.isOk() ? device.value.name : device.error.options.name,
      );
  }
}
