import { z } from "zod";
import { ok, type Result } from "neverthrow";
import { eq } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { db } from "../sqlite/db";
import {
  devices,
  device_modbus_rtu_options,
  device_modbus_tcp_options,
  device_opcua_client_options,
  z_insertDevice,
  z_deviceModbusRtuOptions,
  z_deviceModbusTcpOptions,
  z_deviceOpcuaClientOptions,
  type DeviceSelect,
} from "../sqlite/tables";
import { ModbusRTUDriver } from "./modbus/modbusRtu";
import { ModbusTCPDriver } from "./modbus/modbusTcp";
import { OpcuaClientDriver } from "./opcua/opcuaClient";
import type { Driver } from "./baseDriver";
import type { NeverThrowError } from "$lib/util/neverThrow";

export type DriverCreateError = NeverThrowError;

/**
 * The slice of drizzle a write needs. Both the db handle and a transaction
 * handle satisfy it, so the registry's writes work inside or outside a
 * transaction without caring which.
 */
export type Db = Pick<typeof db, "insert" | "delete" | "update" | "select">;

/** Every column present, because these come out of a parse that applied defaults. */
type OptionsOf<T extends z.ZodType> = z.output<T>;

export type ModbusTCPOptions = OptionsOf<typeof z_deviceModbusTcpOptions>;
export type ModbusRTUOptions = OptionsOf<typeof z_deviceModbusRtuOptions>;
export type OpcuaClientOptions = OptionsOf<typeof z_deviceOpcuaClientOptions>;

export interface DriverRegistration<N extends string, O> {
  /** Stored verbatim on `devices.driverName`. */
  readonly id: N;
  readonly displayName: string;
  readonly logo: string;
  /** The one table this driver's options live in. */
  readonly optionsTable: SQLiteTable;
  /** Validates and defaults a partial payload into a full option set. */
  readonly optionsSchema: z.ZodType;
  /** What a brand new device of this driver starts with. */
  readonly defaultOptions: O;
  create(options: O): Result<Driver, DriverCreateError>;
  writeOptions(tx: Db, deviceId: string, options: O): void;
  deleteOptions(tx: Db, deviceId: string): void;
}

/**
 * Adding a driver means adding a key here - the `satisfies` clause rejects the
 * object literal until the shape is updated, and `DriverName` is derived from
 * the shape, so the zod union, the persistence branches and the UI select can
 * never fall out of sync with it.
 */
interface DriverRegistry {
  ModbusTCPDriver: DriverRegistration<"ModbusTCPDriver", ModbusTCPOptions>;
  ModbusRTUDriver: DriverRegistration<"ModbusRTUDriver", ModbusRTUOptions>;
  opcuaClientDriver: DriverRegistration<
    "opcuaClientDriver",
    OpcuaClientOptions
  >;
}

export const driverRegistry = {
  ModbusTCPDriver: {
    id: "ModbusTCPDriver",
    displayName: "Modbus TCP/IP Driver",
    logo: "/images/Modbus_Logo.svg",
    optionsTable: device_modbus_tcp_options,
    optionsSchema: z_deviceModbusTcpOptions,
    defaultOptions: z_deviceModbusTcpOptions.parse({}),
    create: (options: ModbusTCPOptions) => ModbusTCPDriver.create(options),
    writeOptions(tx: Db, deviceId: string, options: ModbusTCPOptions) {
      const row = { ...options, deviceId };
      tx.insert(device_modbus_tcp_options)
        .values(row)
        .onConflictDoUpdate({
          target: device_modbus_tcp_options.deviceId,
          set: row,
        })
        .run();
    },
    deleteOptions(tx: Db, deviceId: string) {
      tx.delete(device_modbus_tcp_options)
        .where(eq(device_modbus_tcp_options.deviceId, deviceId))
        .run();
    },
  },
  ModbusRTUDriver: {
    id: "ModbusRTUDriver",
    displayName: "Modbus RTU Driver",
    logo: "/images/Modbus_Logo.svg",
    optionsTable: device_modbus_rtu_options,
    optionsSchema: z_deviceModbusRtuOptions,
    defaultOptions: z_deviceModbusRtuOptions.parse({}),
    create: (options: ModbusRTUOptions) => ModbusRTUDriver.create(options),
    writeOptions(tx: Db, deviceId: string, options: ModbusRTUOptions) {
      const row = { ...options, deviceId };
      tx.insert(device_modbus_rtu_options)
        .values(row)
        .onConflictDoUpdate({
          target: device_modbus_rtu_options.deviceId,
          set: row,
        })
        .run();
    },
    deleteOptions(tx: Db, deviceId: string) {
      tx.delete(device_modbus_rtu_options)
        .where(eq(device_modbus_rtu_options.deviceId, deviceId))
        .run();
    },
  },
  opcuaClientDriver: {
    id: "opcuaClientDriver",
    displayName: "OPC UA Driver",
    logo: "/images/OPCUA_Logo.svg",
    optionsTable: device_opcua_client_options,
    optionsSchema: z_deviceOpcuaClientOptions,
    defaultOptions: z_deviceOpcuaClientOptions.parse({}),
    create: (options: OpcuaClientOptions) =>
      // the constructor cannot fail: it logs and leaves `client` undefined so
      // connect() reports CLIENT_NOT_INITIALISED rather than throwing
      ok(new OpcuaClientDriver(options)),
    writeOptions(tx: Db, deviceId: string, options: OpcuaClientOptions) {
      const row = { ...options, deviceId };
      tx.insert(device_opcua_client_options)
        .values(row)
        .onConflictDoUpdate({
          target: device_opcua_client_options.deviceId,
          set: row,
        })
        .run();
    },
    deleteOptions(tx: Db, deviceId: string) {
      tx.delete(device_opcua_client_options)
        .where(eq(device_opcua_client_options.deviceId, deviceId))
        .run();
    },
  },
} satisfies DriverRegistry;

export type DriverName = keyof DriverRegistry;

/** The options type belonging to one specific driver. */
export type DriverOptionsOf<N extends DriverName> =
  DriverRegistry[N] extends DriverRegistration<string, infer O> ? O : never;

/* -------------------------------------------------------------------------- */
/*  The device config union                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A device row plus the options for the one driver it uses. Built from the
 * registry so a driver cannot exist without a discriminated branch here, and
 * the branch cannot disagree with the table it is paired with.
 */
export const z_DeviceConfig = z.discriminatedUnion("driverName", [
  z_insertDevice.extend({
    driverName: z.literal(driverRegistry.ModbusTCPDriver.id),
    options: driverRegistry.ModbusTCPDriver.optionsSchema,
  }),
  z_insertDevice.extend({
    driverName: z.literal(driverRegistry.ModbusRTUDriver.id),
    options: driverRegistry.ModbusRTUDriver.optionsSchema,
  }),
  z_insertDevice.extend({
    driverName: z.literal(driverRegistry.opcuaClientDriver.id),
    options: driverRegistry.opcuaClientDriver.optionsSchema,
  }),
]);

/** What a client may send: options can be partial and get defaulted. */
export type DeviceConfigInput = z.input<typeof z_DeviceConfig>;
/** What the server runs on: every option column present. */
export type DeviceConfig = z.output<typeof z_DeviceConfig>;

/* -------------------------------------------------------------------------- */
/*  Config driven operations                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Narrowing on `driverName` is what proves `config.options` belongs to the
 * factory being handed it, which is why this is a switch rather than an
 * indexed lookup.
 */
export function createDriver(
  config: DeviceConfig,
): Result<Driver, DriverCreateError> {
  switch (config.driverName) {
    case "ModbusTCPDriver":
      return driverRegistry.ModbusTCPDriver.create(config.options);
    case "ModbusRTUDriver":
      return driverRegistry.ModbusRTUDriver.create(config.options);
    case "opcuaClientDriver":
      return driverRegistry.opcuaClientDriver.create(config.options);
  }
}

function writeOptionsFor(tx: Db, config: DeviceConfig) {
  switch (config.driverName) {
    case "ModbusTCPDriver":
      return driverRegistry.ModbusTCPDriver.writeOptions(
        tx,
        config.id,
        config.options,
      );
    case "ModbusRTUDriver":
      return driverRegistry.ModbusRTUDriver.writeOptions(
        tx,
        config.id,
        config.options,
      );
    case "opcuaClientDriver":
      return driverRegistry.opcuaClientDriver.writeOptions(
        tx,
        config.id,
        config.options,
      );
  }
}

/**
 * A device only ever owns one options row, in the table of its current driver.
 * Callers keep the two in step by writing the devices row and the options row
 * in the same transaction.
 */
export function writeDeviceConfig(tx: Db, config: DeviceConfig) {
  const { options: _options, ...deviceRow } = config;
  tx.insert(devices)
    .values(deviceRow)
    .onConflictDoUpdate({ target: devices.id, set: deviceRow })
    .run();
  writeOptionsFor(tx, config);
}

/** Drops the options rows left behind by whichever driver this one replaced. */
export function deleteStaleOptions(tx: Db, deviceId: string, keep: DriverName) {
  for (const name of Object.keys(driverRegistry) as DriverName[]) {
    if (name === keep) continue;
    switch (name) {
      case "ModbusTCPDriver":
        driverRegistry.ModbusTCPDriver.deleteOptions(tx, deviceId);
        break;
      case "ModbusRTUDriver":
        driverRegistry.ModbusRTUDriver.deleteOptions(tx, deviceId);
        break;
      case "opcuaClientDriver":
        driverRegistry.opcuaClientDriver.deleteOptions(tx, deviceId);
        break;
    }
  }
}

/** Pairs a devices row with the options row of the driver it names. */
export function readDeviceConfig(
  row: DeviceSelect,
  options: Record<DriverName, unknown>,
): DeviceConfig | undefined {
  const candidate = options[row.driverName as DriverName];
  if (!candidate) return undefined;
  const parsed = z_DeviceConfig.safeParse({ ...row, options: candidate });
  return parsed.success ? parsed.data : undefined;
}

/** Metadata for the UI select, straight from the registry. */
export const availableDrivers = Object.fromEntries(
  Object.entries(driverRegistry).map(([name, entry]) => [
    name,
    {
      id: entry.id,
      displayName: entry.displayName,
      logo: entry.logo,
      defaultOptions: entry.defaultOptions,
    },
  ]),
) as {
  [N in DriverName]: {
    id: N;
    displayName: string;
    logo: string;
    defaultOptions: DriverRegistry[N]["defaultOptions"];
  };
};
