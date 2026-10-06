import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { devices } from "./devices";

export const device_opcua_client_options = sqliteTable("device_opcua_client_options", {
  deviceId: text("deviceId")
    .primaryKey()
    .references(() => devices.id, { onDelete: "cascade" }),
  endpointUrl: text("endpointUrl").notNull().default("opc.tcp://url:4840"),
  /** How often the server is asked to sample each watched node. */
  samplingIntervalMs: integer("samplingIntervalMs").notNull().default(1000),
  /** Server side queue depth per monitored item; the oldest is dropped when full. */
  queueSize: integer("queueSize").notNull().default(10),
  /** Absolute deadband, so only changes larger than this are reported. 0 disables. */
  deadbandValue: real("deadbandValue").notNull().default(0),
});

export type DeviceOpcuaClientOptionsSelect = typeof device_opcua_client_options.$inferSelect;
export type DeviceOpcuaClientOptionsInsert = typeof device_opcua_client_options.$inferInsert;

export const z_insertDeviceOpcuaClientOptions = createInsertSchema(device_opcua_client_options, {
  endpointUrl: (s) => s.min(1).max(2048).default("opc.tcp://url:4840"),
  samplingIntervalMs: (s) => s.min(50).max(600000).default(1000),
  queueSize: (s) => s.min(1).max(10000).default(10),
  deadbandValue: (s) => s.min(0).max(1000000000).default(0),
});

/**
 * The same options without the `deviceId` foreign key. `deviceId` is owned by
 * the devices row, not by the user, so drivers and the client work with this
 * shape and the id is attached when the row is written.
 */
export const z_deviceOpcuaClientOptions = z_insertDeviceOpcuaClientOptions.omit({
  deviceId: true,
});