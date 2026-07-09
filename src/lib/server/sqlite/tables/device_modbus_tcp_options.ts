import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { devices } from "./devices";

export const device_modbus_tcp_options = sqliteTable("device_modbus_tcp_options", {
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
  endian: text("endian").notNull().default("LittleEndian"),
  swapWords: integer("swapWords", { mode: "boolean" }).notNull().default(false),
});

export type DeviceModbusTcpOptionsSelect = typeof device_modbus_tcp_options.$inferSelect;
export type DeviceModbusTcpOptionsInsert = typeof device_modbus_tcp_options.$inferInsert;

export const z_insertDeviceModbusTcpOptions = createInsertSchema(device_modbus_tcp_options);
