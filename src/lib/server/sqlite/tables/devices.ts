import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { sqlEnumList } from "./enums";

/**
 * The only place a driver name is written. The column types itself from this
 * list, and the registry and the zod union in drivers/registry.ts are checked
 * against it, so a name cannot be added to one and forgotten in the others.
 */
export const driverNames = ["ModbusTCPDriver", "ModbusRTUDriver", "opcuaClientDriver"] as const;
export type DriverName = (typeof driverNames)[number];

export const devices = sqliteTable(
  "devices",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().unique(),
    driverName: text("driverName", { enum: driverNames }).notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [check("devices_driverName_check", sql`${t.driverName} in (${sqlEnumList(driverNames)})`)],
);

export type DeviceSelect = typeof devices.$inferSelect;
export type DeviceInsert = typeof devices.$inferInsert;

export const z_insertDevice = createInsertSchema(devices, {
  name: (s) => s.min(1).max(64),
  enabled: (s) => s.default(true),
});
