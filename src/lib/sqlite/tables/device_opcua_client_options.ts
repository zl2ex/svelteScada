import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
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

export const z_DeviceOpcuaClientOptionsSelect = createSelectSchema(device_opcua_client_options);

/**
 * The insert schema without a required `deviceId`: the owning device supplies
 * the foreign key when the row is written, so the client and the drivers work
 * with this shape.
 */
export const z_DeviceOpcuaClientOptionsInsert = createInsertSchema(device_opcua_client_options, {
  deviceId: (s) => s.optional(),
  endpointUrl: (s) => s.min(1).max(2048).default("opc.tcp://url:4840"),
  samplingIntervalMs: (s) => s.min(50).max(600000).default(1000),
  queueSize: (s) => s.min(1).max(10000).default(10),
  deadbandValue: (s) => s.min(0).max(1000000000).default(0),
});

export type DeviceOpcuaClientOptionsInsert = z.input<typeof z_DeviceOpcuaClientOptionsInsert>;
export type DeviceOpcuaClientOptionsConfig = z.output<typeof z_DeviceOpcuaClientOptionsInsert>;
