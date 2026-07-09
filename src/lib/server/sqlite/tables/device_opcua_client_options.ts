import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { devices } from "./devices";

export const device_opcua_client_options = sqliteTable("device_opcua_client_options", {
  deviceId: text("deviceId")
    .primaryKey()
    .references(() => devices.id, { onDelete: "cascade" }),
  endpointUrl: text("endpointUrl").notNull().default("opc.tcp://localhost:4840"),
});

export type DeviceOpcuaClientOptionsSelect = typeof device_opcua_client_options.$inferSelect;
export type DeviceOpcuaClientOptionsInsert = typeof device_opcua_client_options.$inferInsert;

export const z_insertDeviceOpcuaClientOptions = createInsertSchema(device_opcua_client_options);
