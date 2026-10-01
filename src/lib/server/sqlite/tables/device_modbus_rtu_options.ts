import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { devices } from "./devices";

export const device_modbus_rtu_options = sqliteTable("device_modbus_rtu_options", {
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
  endian: text("endian").notNull().default("LittleEndian"),
});

export type DeviceModbusRtuOptionsSelect = typeof device_modbus_rtu_options.$inferSelect;
export type DeviceModbusRtuOptionsInsert = typeof device_modbus_rtu_options.$inferInsert;

export const z_insertDeviceModbusRtuOptions = createInsertSchema(
  device_modbus_rtu_options,
  {
    serialPort: (s) => s.default(""),
    baudRate: (s) => s.default(9600),
    parity: (s) => s.default("none"),
    unitId: (s) => s.default(1),
    spanGaps: (s) => s.default(false),
    pollingIntervalMs: (s) => s.default(1000),
    startAddress: (s) => s.default(0),
    endian: (s) => s.default("LittleEndian"),
  },
);
