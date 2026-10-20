import { check, sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { devices } from "./devices";
import { endianNames, sqlEnumList } from "./enums";

export const device_modbus_tcp_options = sqliteTable(
  "device_modbus_tcp_options",
  {
    deviceId: text("deviceId")
      .primaryKey()
      .references(() => devices.id, { onDelete: "cascade" }),
    ip: text("ip").notNull().default("127.0.0.1"),
    port: integer("port").notNull().default(502),
    unitId: integer("unitId").notNull().default(1),
    pollingIntervalMs: integer("pollingIntervalMs").notNull().default(1000),
    spanGaps: integer("spanGaps", { mode: "boolean" }).notNull().default(false),
    reconnectInervalMs: real("reconnectInervalMs").notNull().default(5000),
    startAddress: real("startAddress").notNull().default(0),
    endian: text("endian", { enum: endianNames }).notNull().default("LittleEndian"),
    swapWords: integer("swapWords", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [check("device_modbus_tcp_options_endian_check", sql`${t.endian} in (${sqlEnumList(endianNames)})`)],
);

export type DeviceModbusTcpOptionsSelect = typeof device_modbus_tcp_options.$inferSelect;

export const z_DeviceModbusTcpOptionsSelect = createSelectSchema(device_modbus_tcp_options);

/**
 * The insert schema without a required `deviceId`: the owning device supplies
 * the foreign key when the row is written, so the client and the drivers work
 * with this shape.
 */
export const z_DeviceModbusTcpOptionsInsert = createInsertSchema(device_modbus_tcp_options, {
  deviceId: (s) => s.optional(),
  ip: (s) => s.min(1).default("127.0.0.1"),
  port: (s) => s.min(1).max(65535).default(502),
  unitId: (s) => s.min(1).max(247).default(1),
  pollingIntervalMs: (s) => s.min(500).max(600000).default(1000),
  spanGaps: (s) => s.default(false),
  reconnectInervalMs: (s) => s.min(1000).max(600000).default(5000),
  startAddress: (s) => s.min(0).max(65535).default(0),
  endian: () => z.enum(endianNames).default("LittleEndian"),
  swapWords: (s) => s.default(false),
});

export type DeviceModbusTcpOptionsInsert = z.input<typeof z_DeviceModbusTcpOptionsInsert>;
export type DeviceModbusTcpOptionsConfig = z.output<typeof z_DeviceModbusTcpOptionsInsert>;
