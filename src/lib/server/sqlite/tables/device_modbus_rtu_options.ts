import { check, sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { devices } from "./devices";
import { endianNames, sqlEnumList } from "./enums";

export const device_modbus_rtu_options = sqliteTable(
  "device_modbus_rtu_options",
  {
    deviceId: text("deviceId")
      .primaryKey()
      .references(() => devices.id, { onDelete: "cascade" }),
    serialPort: text("serialPort").notNull().default(""),
    baudRate: integer("baudRate").notNull().default(9600),
    parity: text("parity").notNull().default("none"),
    unitId: integer("unitId").notNull().default(1),
    spanGaps: integer("spanGaps", { mode: "boolean" }).notNull().default(false),
    pollingIntervalMs: integer("pollingIntervalMs").notNull().default(1000),
    startAddress: real("startAddress").notNull().default(0),
    endian: text("endian", { enum: endianNames }).notNull().default("LittleEndian"),
    swapWords: integer("swapWords", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [check("device_modbus_rtu_options_endian_check", sql`${t.endian} in (${sqlEnumList(endianNames)})`)],
);

export type DeviceModbusRtuOptionsSelect = typeof device_modbus_rtu_options.$inferSelect;
export type DeviceModbusRtuOptionsInsert = typeof device_modbus_rtu_options.$inferInsert;

export const z_insertDeviceModbusRtuOptions = createInsertSchema(device_modbus_rtu_options, {
  serialPort: (s) => s.default(""),
  baudRate: (s) => s.min(1200).max(4000000).default(9600),
  parity: () => z.enum(["none", "even", "odd", "mark", "space"]).default("none"),
  unitId: (s) => s.min(1).max(247).default(1),
  spanGaps: (s) => s.default(false),
  pollingIntervalMs: (s) => s.min(500).max(600000).default(1000),
  startAddress: (s) => s.min(0).max(65535).default(0),
  endian: () => z.enum(endianNames).default("LittleEndian"),
  swapWords: (s) => s.default(false),
});

/**
 * The same options without the `deviceId` foreign key. `deviceId` is owned by
 * the devices row, not by the user, so drivers and the client work with this
 * shape and the id is attached when the row is written.
 */
export const z_deviceModbusRtuOptions = z_insertDeviceModbusRtuOptions.omit({
  deviceId: true,
});
