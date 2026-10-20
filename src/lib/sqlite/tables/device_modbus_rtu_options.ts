import { check, sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { devices } from "./devices";
import { endianNames, parityNames, sqlEnumList } from "./enums";

export const device_modbus_rtu_options = sqliteTable(
  "device_modbus_rtu_options",
  {
    deviceId: text("deviceId")
      .primaryKey()
      .references(() => devices.id, { onDelete: "cascade" }),
    serialPort: text("serialPort").notNull().default(""),
    baudRate: integer("baudRate").notNull().default(9600),
    parity: text("parity", { enum: parityNames }).notNull().default("none"),
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

export const z_DeviceModbusRtuOptionsSelect = createSelectSchema(device_modbus_rtu_options);

/**
 * The insert schema without a required `deviceId`: the owning device supplies
 * the foreign key when the row is written, so the client and the drivers work
 * with this shape.
 */
export const z_DeviceModbusRtuOptionsInsert = createInsertSchema(device_modbus_rtu_options, {
  deviceId: (s) => s.optional(),
  serialPort: (s) => s.default(""),
  baudRate: (s) => s.min(1200).max(4000000).default(9600),
  parity: () => z.enum(parityNames).default("none"),
  unitId: (s) => s.min(1).max(247).default(1),
  spanGaps: (s) => s.default(false),
  pollingIntervalMs: (s) => s.min(500).max(600000).default(1000),
  startAddress: (s) => s.min(0).max(65535).default(0),
  endian: () => z.enum(endianNames).default("LittleEndian"),
  swapWords: (s) => s.default(false),
});

export type DeviceModbusRtuOptionsInsert = z.input<typeof z_DeviceModbusRtuOptionsInsert>;
export type DeviceModbusRtuOptionsConfig = z.output<typeof z_DeviceModbusRtuOptionsInsert>;
