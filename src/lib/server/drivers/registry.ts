import { z } from "zod";
import type { Result } from "neverthrow";
import { eq } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { db } from "../sqlite/db";
import {
  devices,
  device_modbus_rtu_options,
  device_modbus_tcp_options,
  device_opcua_client_options,
  endianNames,
  z_insertDevice,
  z_deviceModbusRtuOptions,
  z_deviceModbusTcpOptions,
  z_deviceOpcuaClientOptions,
  type DeviceSelect,
  type DriverName,
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

export type OptionFieldKind = "text" | "number" | "boolean" | "select";

/**
 * One editable option, described so the UI can render a driver it has never
 * heard of without importing its schema. `choices` only has literals for a
 * `select`, and they are typed to the values the option accepts so the select
 * cannot offer one the schema would reject.
 */
export type OptionField<V> = {
  readonly label: string;
  readonly kind: OptionFieldKind;
  readonly choices?: readonly (V & string)[];
};

/**
 * Keyed by option name, so the mapped type demands a field for every option:
 * a driver that grows an option without a field here stops compiling.
 */
export type OptionFieldsOf<O> = {
  readonly [K in keyof O & string]: OptionField<O[K]>;
};

export interface DriverRegistration<N extends DriverName, O> {
  /** Stored verbatim on `devices.driverName`. */
  readonly id: N;
  readonly displayName: string;
  readonly logo: string;
  /** The one table this driver's options live in. */
  readonly optionsTable: SQLiteTable;
  /** Validates and defaults a partial payload into a full option set. */
  readonly optionsSchema: z.ZodType;
  /** What the UI renders and the user edits, one field per option. */
  readonly optionFields: OptionFieldsOf<O>;
  /** What a brand new device of this driver starts with. */
  readonly defaultOptions: O;
  create(options: O): Result<Driver, DriverCreateError>;
  writeOptions(tx: Db, deviceId: string, options: O): void;
  deleteOptions(tx: Db, deviceId: string): void;
}

/**
 * Which option type belongs to which driver name. This is the one mapping the
 * `driverName` column cannot supply, so it is written out here - and because
 * it is keyed by the column's own union, a name added to the column without
 * options here stops `driverRegistry` compiling.
 */
interface DriverOptionsByName {
  ModbusTCPDriver: ModbusTCPOptions;
  ModbusRTUDriver: ModbusRTUOptions;
  opcuaClientDriver: OpcuaClientOptions;
}

/**
 * Keyed by the names the `devices.driverName` column accepts, so the registry
 * cannot hold a driver the column refuses or miss one it allows: the
 * `satisfies` clause below rejects the object literal until the shape is
 * updated, and every switch on a driver name stops being exhaustive at the
 * same moment.
 */
type DriverRegistry = {
  [N in DriverName]: DriverRegistration<N, DriverOptionsByName[N]>;
};

/**
 * The options the two modbus drivers have in common, described once so their
 * labels and input kinds cannot drift apart.
 */
type ModbusCommonOption = "unitId" | "spanGaps" | "pollingIntervalMs" | "startAddress" | "endian" | "swapWords";

const modbusCommonFields = {
  unitId: { label: "Unit Id", kind: "number" },
  spanGaps: { label: "Span Gaps", kind: "boolean" },
  pollingIntervalMs: { label: "Poll Interval (ms)", kind: "number" },
  startAddress: { label: "Start Address", kind: "number" },
  endian: {
    label: "Endian",
    kind: "select",
    choices: endianNames,
  },
  swapWords: { label: "Swap Words", kind: "boolean" },
} satisfies Pick<OptionFieldsOf<ModbusTCPOptions>, ModbusCommonOption> &
  Pick<OptionFieldsOf<ModbusRTUOptions>, ModbusCommonOption>;

export const driverRegistry = {
  ModbusTCPDriver: {
    id: "ModbusTCPDriver",
    displayName: "Modbus TCP/IP Driver",
    logo: "/images/Modbus_Logo.svg",
    optionsTable: device_modbus_tcp_options,
    optionsSchema: z_deviceModbusTcpOptions,
    optionFields: {
      ip: { label: "IP Address", kind: "text" },
      port: { label: "Port", kind: "number" },
      reconnectInervalMs: { label: "Reconnect Interval (ms)", kind: "number" },
      ...modbusCommonFields,
    },
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
      tx.delete(device_modbus_tcp_options).where(eq(device_modbus_tcp_options.deviceId, deviceId)).run();
    },
  },
  ModbusRTUDriver: {
    id: "ModbusRTUDriver",
    displayName: "Modbus RTU Driver",
    logo: "/images/Modbus_Logo.svg",
    optionsTable: device_modbus_rtu_options,
    optionsSchema: z_deviceModbusRtuOptions,
    optionFields: {
      serialPort: { label: "Serial Port", kind: "text" },
      baudRate: { label: "Baud Rate", kind: "number" },
      parity: {
        label: "Parity",
        kind: "select",
        choices: ["none", "even", "odd", "mark", "space"] as const,
      },
      ...modbusCommonFields,
    },
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
      tx.delete(device_modbus_rtu_options).where(eq(device_modbus_rtu_options.deviceId, deviceId)).run();
    },
  },
  opcuaClientDriver: {
    id: "opcuaClientDriver",
    displayName: "OPC UA Driver",
    logo: "/images/OPCUA_Logo.svg",
    optionsTable: device_opcua_client_options,
    optionsSchema: z_deviceOpcuaClientOptions,
    optionFields: {
      endpointUrl: { label: "Endpoint URL", kind: "text" },
    },
    defaultOptions: z_deviceOpcuaClientOptions.parse({}),
    create: (options: OpcuaClientOptions) => OpcuaClientDriver.create(options),
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
      tx.delete(device_opcua_client_options).where(eq(device_opcua_client_options.deviceId, deviceId)).run();
    },
  },
} satisfies DriverRegistry;

export type { DriverName };

/** The options type belonging to one specific driver. */
export type DriverOptionsOf<N extends DriverName> = DriverOptionsByName[N];

/* -------------------------------------------------------------------------- */
/*  The device config union                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A device row plus the options for the one driver it uses. Built from the
 * registry so a driver cannot exist without a discriminated branch here, and
 * the branch cannot disagree with the table it is paired with.
 *
 * The branches are written out because zod wants a runtime tuple, which a type
 * cannot produce, so `NamesAgree` below is what keeps the list honest.
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

/** The names the column will store, read back off the column itself. */
type ColumnDriverName = NonNullable<typeof devices.$inferSelect>["driverName"];
type UnionDriverName = z.output<typeof z_DeviceConfig>["driverName"];

/**
 * Both directions, so neither the column nor the union can gain a name alone:
 * `never` in either spot makes this a compile error rather than a runtime one.
 */
type NamesAgree = [ColumnDriverName] extends [UnionDriverName]
  ? [UnionDriverName] extends [ColumnDriverName]
    ? true
    : never
  : never;
export const _namesAgree: NamesAgree = true;

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
export function createDriver(config: DeviceConfig): Result<Driver, DriverCreateError> {
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
      return driverRegistry.ModbusTCPDriver.writeOptions(tx, config.id, config.options);
    case "ModbusRTUDriver":
      return driverRegistry.ModbusRTUDriver.writeOptions(tx, config.id, config.options);
    case "opcuaClientDriver":
      return driverRegistry.opcuaClientDriver.writeOptions(tx, config.id, config.options);
  }
}

/**
 * A device only ever owns one options row, in the table of its current driver.
 * Callers keep the two in step by writing the devices row and the options row
 * in the same transaction.
 */
export function writeDeviceConfig(tx: Db, config: DeviceConfig) {
  const { options: _options, ...deviceRow } = config;
  tx.insert(devices).values(deviceRow).onConflictDoUpdate({ target: devices.id, set: deviceRow }).run();
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

/** Metadata for the UI, straight from the registry. */
export type AvailableDrivers = {
  [N in DriverName]: {
    id: N;
    displayName: string;
    logo: string;
    optionFields: DriverRegistry[N]["optionFields"];
    defaultOptions: DriverRegistry[N]["defaultOptions"];
  };
};

// written out per driver rather than mapped over the registry: `Object.entries`
// throws away which options belong to which driver, and the field metadata is
// only useful while that pairing survives.
export const availableDrivers: AvailableDrivers = {
  ModbusTCPDriver: {
    id: driverRegistry.ModbusTCPDriver.id,
    displayName: driverRegistry.ModbusTCPDriver.displayName,
    logo: driverRegistry.ModbusTCPDriver.logo,
    optionFields: driverRegistry.ModbusTCPDriver.optionFields,
    defaultOptions: driverRegistry.ModbusTCPDriver.defaultOptions,
  },
  ModbusRTUDriver: {
    id: driverRegistry.ModbusRTUDriver.id,
    displayName: driverRegistry.ModbusRTUDriver.displayName,
    logo: driverRegistry.ModbusRTUDriver.logo,
    optionFields: driverRegistry.ModbusRTUDriver.optionFields,
    defaultOptions: driverRegistry.ModbusRTUDriver.defaultOptions,
  },
  opcuaClientDriver: {
    id: driverRegistry.opcuaClientDriver.id,
    displayName: driverRegistry.opcuaClientDriver.displayName,
    logo: driverRegistry.opcuaClientDriver.logo,
    optionFields: driverRegistry.opcuaClientDriver.optionFields,
    defaultOptions: driverRegistry.opcuaClientDriver.defaultOptions,
  },
};
