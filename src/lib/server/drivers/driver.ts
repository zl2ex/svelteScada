import util from "node:util";
import { z } from "zod";
import { err, ok, type Result } from "neverthrow";
import { eq } from "drizzle-orm";
import {
  errorToString,
  neverThrowErrorToString,
  type NeverThrowError,
} from "$lib/util/neverThrow";
import { logger } from "$lib/server/pino/logger";
import { attempt } from "$lib/util/attempt";
import type { BaseTypeStrings } from "$lib/server/tag/tag";
import { publishDeviceStatus } from "../../../live/devices";
import { db } from "../sqlite/db";
import { devices } from "../sqlite/tables";
import {
  availableDrivers,
  createDriver,
  deleteStaleOptions,
  driverRegistry,
  readDeviceConfig,
  writeDeviceConfig,
  z_DeviceConfig,
  type Db,
  type DeviceConfig,
  type DeviceConfigInput,
  type DriverName,
} from "./registry";
import type {
  Driver,
  DriverValue,
  DriverVariable,
  SubscribeOptions,
} from "./baseDriver";

/**
 * The shared driver vocabulary lives in `baseDriver` so the concrete drivers
 * never have to import this module; it is re-exported so existing call sites
 * keep a single obvious entry point.
 */
export type {
  Driver,
  DriverConnectError,
  DriverConnectionListener,
  DriverDisconnectError,
  DriverSubscribeError,
  DriverValue,
  DriverVariable,
  DriverWriteError,
  Reading,
  SubscribeOptions,
} from "./baseDriver";

export type {
  DeviceConfig,
  DeviceConfigInput,
  DriverName,
  DriverOptionsOf,
} from "./registry";

export { availableDrivers, driverRegistry, z_DeviceConfig };

export type DeviceStatus = "Error" | "Connected" | "Reconnecting" | "Disabled";

export type FailedDevice = NeverThrowError & {
  options: DeviceConfigInput;
};

type DeviceStatusListener = (status: DeviceStatus) => void;

export class Device {
  id: string;
  name: string;
  /** Fully resolved: every option column is present, defaults applied. */
  options: DeviceConfig;
  /**
   * Held as the consumer-facing contract only, so nothing in `Device` can
   * reach a socket, a session or a poll timer through the driver.
   */
  #driver: Driver;
  /** fired whenever the driver connection state changes */
  #driverUnsubscribe?: () => void;
  /** fired whenever `status` changes, see onChange() */
  #statusListeners = new Set<DeviceStatusListener>();

  private constructor(config: DeviceConfig, driver: Driver) {
    this.name = config.name;
    // create new instance id
    this.id = config.id;
    this.options = config;
    this.#driver = driver;
    // the driver is the source of truth for connection state, mirror it up
    this.#driverUnsubscribe = driver.onConnectedChange(() =>
      this.#refreshStatus(),
    );
  }

  static async create(input: DeviceConfigInput) {
    const parsed = z_DeviceConfig.safeParse(input);
    if (!parsed.success) {
      return err({
        reason: "OPTIONS_PARSE_ERROR",
        cause: `[Device] create() failed to parse device options: ${parsed.error.issues} ${parsed.error.message}`,
        options: input,
      } as const satisfies FailedDevice);
    }
    const config = parsed.data;

    const created = createDriver(config);
    if (created.isErr()) {
      return err({
        reason: "DRIVER_CREATE_ERROR",
        cause: `[Device] create() failed to create ${config.driverName}: ${neverThrowErrorToString(
          created.error.cause,
        )}`,
        options: input,
      } as const satisfies FailedDevice);
    }

    const device = new Device(config, created.value);
    await device.#connectIfEnabled();
    return ok(device);
  }

  /**
   * Brings the transport up if the config asked for it. Owned by the instance
   * so the driver stays out of reach of the static factory, which would
   * otherwise have to reach through a private field.
   */
  async #connectIfEnabled() {
    if (!this.options.enabled) return;
    const connected = await this.#driver.connect();
    if (connected.isErr()) {
      logger.error(
        `[Device] create() ${neverThrowErrorToString(connected.error)}`,
      );
    }
  }

  [Symbol.dispose]() {
    // the protocol is synchronous but the transport is not, so the async tail
    // is left running rather than blocking the enclosing scope
    void this.dispose();
  }

  /**
   * Tears the device down. Async because the transport has to be told to
   * disconnect before the driver is disposed - disposing first would leave
   * sockets and OPC UA sessions behind.
   */
  async dispose() {
    this.#driverUnsubscribe?.();
    this.#driverUnsubscribe = undefined;
    this.#statusListeners.clear();

    const disconnected = await this.#driver.disconnect();
    if (disconnected.isErr()) {
      logger.error(
        `[Device] dispose() ${this.name} ${neverThrowErrorToString(disconnected.error)}`,
      );
    }
    this.#driver.dispose();
    logger.trace(`[Device] dispose() ${this.name}`);
  }

  async enable() {
    this.options.enabled = true;
    const connected = await this.#driver.connect();
    if (connected.isErr()) {
      logger.error(
        `[Device] enable() ${this.name} ${neverThrowErrorToString(connected.error)}`,
      );
    }
    this.#refreshStatus();
  }

  async disable() {
    this.options.enabled = false;
    const disconnected = await this.#driver.disconnect();
    if (disconnected.isErr()) {
      logger.error(
        `[Device] disable() ${this.name} ${neverThrowErrorToString(disconnected.error)}`,
      );
    }
    this.#refreshStatus();
  }

  get status(): DeviceStatus {
    return this.#computeStatus();
  }

  #computeStatus(): DeviceStatus {
    if (this.options.enabled) {
      return this.#driver.connected ? "Connected" : "Reconnecting";
    } else {
      return "Disabled";
    }
  }

  /** recompute the status and notify listeners */
  #refreshStatus() {
    const stauts = this.#computeStatus();
    for (const cb of this.#statusListeners) {
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
    this.#statusListeners.add(entry);
    entry(this.#computeStatus());
    return () => {
      this.#statusListeners.delete(entry);
    };
  }

  subscribe(
    path: string,
    dataType: BaseTypeStrings,
    opts?: SubscribeOptions,
  ): Result<DriverVariable<DriverValue>, FailedDevice> {
    const subscribed = this.#driver.subscribe(path, dataType, opts);
    if (subscribed.isErr()) {
      return err({
        reason: "SUBSCRIBE_FAILED",
        cause: neverThrowErrorToString(subscribed.error.cause),
        options: this.options,
      } as const satisfies FailedDevice);
    }
    return ok(subscribed.value);
  }
}

export class DeviceManager {
  #devices: Map<string, Result<Device, FailedDevice>>;

  constructor() {
    this.#devices = new Map();
  }

  /**
   * Mirror device status changes to the front end. The driver owns the
   * connection state, Device fans it out through onStatusChange() and we publish.
   */
  #trackStatus(device: Result<Device, FailedDevice>) {
    if (device.isErr()) {
      publishDeviceStatus(device.error.options.id, "Error");
      return;
    }
    const created = device.value;
    created.onStatusChange((status) => {
      publishDeviceStatus(created.id, status);
    });
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
      const deviceConfig = readDeviceConfig(row, {
        ModbusTCPDriver: row.device_modbus_tcp_options,
        ModbusRTUDriver: row.device_modbus_rtu_options,
        opcuaClientDriver: row.device_opcua_client_options,
      });

      if (!deviceConfig) {
        logger.error(
          `[DeviceManager] loadAllFromDb() failed, no driver options provided for ${row.id} ${row.name}  ${row.driverName}`,
        );
        continue;
      }

      const device = await Device.create(deviceConfig);

      this.#devices.set(row.id, device);
      this.#trackStatus(device);
      deviceCount++;
    }
    logger.debug(`[DeviceManager] loaded ${deviceCount} devices from database`);
    return ok(true);
  }

  async addDevice(options: DeviceConfigInput) {
    if (this.#devices.has(options.id)) {
      return err({
        reason: "DEVICE_ALREADY_EXISTS",
        cause: `[DeviceManager] addDevice() device ${options.id} ${options.name} already exists`,
        options,
      } as const satisfies FailedDevice);
    }

    // Parse once here so the row written and the driver built both come from
    // the same resolved config rather than each re-deriving defaults.
    const parsed = z_DeviceConfig.safeParse(options);
    if (!parsed.success) {
      return err({
        reason: "OPTIONS_PARSE_ERROR",
        cause: `[DeviceManager] addDevice() failed to parse ${options.name}: ${parsed.error.message}`,
        options,
      } as const satisfies FailedDevice);
    }
    const config = parsed.data;

    const dbWrite = attempt(() =>
      db.transaction((tx) => writeDeviceConfig(tx, config)),
    );

    if (dbWrite.error) {
      return err({
        reason: "DB_ERROR",
        cause: `[DeviceManager] addDevice() failed to write device ${options.name} to database: ${errorToString(
          dbWrite.error,
        )}`,
      } as const satisfies NeverThrowError);
    }

    const device = await Device.create(config);

    this.#devices.set(config.id, device);
    this.#trackStatus(device);
    logger.info(`[DeviceManager] added device ${config.id} ${config.name}`);
    if (device.isErr()) return err(device.error);
    return ok(device.value);
  }

  async removeDevice(id: string) {
    const oldDevice = this.#devices.get(id);
    if (!oldDevice) {
      return err({
        reason: "DEVICE_NOT_FOUND",
        cause: `[DeviceManager] removeDevice() device at ${id} not found`,
      } as const satisfies NeverThrowError);
    }

    // the option rows go with it: each table cascades on devices.id
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

    if (oldDevice.isOk()) await oldDevice.value.dispose();
    this.#devices.delete(id);
    logger.info(`[DeviceManager] removed device ${id}`);
    return ok(true);
  }

  /**
   * Move a device onto a different driver. The old driver's options have no
   * meaning under the new one, so the device restarts on the new driver's
   * defaults; the rows the old driver left behind are dropped in the same
   * transaction that writes the new ones.
   */
  async changeDriver(id: string, driverName: DriverName) {
    const existing = this.#devices.get(id);
    if (!existing) {
      return err({
        reason: "DEVICE_NOT_FOUND",
        cause: `[DeviceManager] changeDriver() device at ${id} not found`,
      } as const satisfies NeverThrowError);
    }

    const current = existing.isOk()
      ? existing.value.options
      : existing.error.options;

    // The old driver's options are dropped, not migrated: they describe a
    // different transport and none of it carries over. The registry lookup
    // yields every driver's defaults as one union, and the parse is what pairs
    // them back with the driverName that produced them.
    const next = {
      id: current.id,
      name: current.name,
      enabled: current.enabled ?? true,
      driverName,
      options: driverRegistry[driverName].defaultOptions,
    };

    const parsed = z_DeviceConfig.safeParse(next);
    if (!parsed.success) {
      return err({
        reason: "OPTIONS_PARSE_ERROR",
        cause: `[DeviceManager] changeDriver() failed to build ${driverName} defaults for ${id}: ${parsed.error.message}`,
        options: next as DeviceConfigInput,
      } as const satisfies FailedDevice);
    }
    const config = parsed.data;

    const dbWrite = attempt(() =>
      db.transaction((tx) => {
        writeDeviceConfig(tx, config);
        deleteStaleOptions(tx, id, driverName);
      }),
    );

    if (dbWrite.error) {
      return err({
        reason: "DB_ERROR",
        cause: `[DeviceManager] changeDriver() failed to switch ${id} to ${driverName}: ${errorToString(
          dbWrite.error,
        )}`,
        options: next as DeviceConfigInput,
      } as const satisfies FailedDevice);
    }

    if (existing.isOk()) await existing.value.dispose();
    this.#devices.delete(id);

    const device = await Device.create(config);
    this.#devices.set(id, device);
    this.#trackStatus(device);
    if (device.isErr()) return err(device.error);

    logger.info(`[DeviceManager] changed driver of ${id} to ${driverName}`);
    return ok(device.value);
  }

  async updateDevice(id: string, options: DeviceConfigInput) {
    const existing = this.#devices.get(id);

    // A driver change is not an edit of the same device - the options belong to
    // a different table and a different schema, so route it to changeDriver()
    // rather than trying to reinterpret them.
    if (
      existing?.isOk() &&
      existing.value.options.driverName !== options.driverName
    ) {
      return this.changeDriver(id, options.driverName);
    }

    const parsed = z_DeviceConfig.safeParse(options);
    if (!parsed.success) {
      return err({
        reason: "OPTIONS_PARSE_ERROR",
        cause: `[DeviceManager] updateDevice() failed to parse ${options.name}: ${parsed.error.message}`,
        options,
      } as const satisfies FailedDevice);
    }
    const config = parsed.data;

    const dbWrite = attempt(() =>
      db.transaction((tx) => writeDeviceConfig(tx, config)),
    );

    if (dbWrite.error) {
      return err({
        reason: "DB_ERROR",
        cause: `[DeviceManager] updateDevice() failed to write device ${id} ${options.name} to database: ${errorToString(
          dbWrite.error,
        )}`,
      } as const satisfies NeverThrowError);
    }

    if (existing) {
      if (existing.isOk()) {
        const { enabled, ...oldOptsWithoutEnabled } = existing.value.options;
        const { enabled: en, ...optsWithoutEnabled } = config;
        // only enabled changed
        if (
          util.isDeepStrictEqual(oldOptsWithoutEnabled, optsWithoutEnabled) &&
          enabled !== config.enabled
        ) {
          if (config.enabled) await existing.value.enable();
          else await existing.value.disable();
          // return existing device and dont delete and re-create a whole new instance
          return ok(existing.value);
        }
        await existing.value.dispose();
      }
      this.#devices.delete(id);
    }

    const newDevice = await Device.create(config);
    this.#devices.set(id, newDevice);
    this.#trackStatus(newDevice);
    if (newDevice.isErr()) return err(newDevice.error);

    logger.info(`[DeviceManager] updated device ${id} ${config.name}`);
    return ok(newDevice.value);
  }

  getDevice(id: string) {
    return this.#devices.get(id);
  }

  getAllDevices() {
    return this.#devices.values().toArray() ?? [];
  }

  getDeviceByName(name: string) {
    const [k, device] =
      this.#devices.entries().find(([key, device]) => {
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
    return this.#devices
      .values()
      .map((device) =>
        device.isOk() ? device.value.name : device.error.options.name,
      );
  }
}
