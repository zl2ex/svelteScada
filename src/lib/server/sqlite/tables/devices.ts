import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
export const devices = sqliteTable("devices", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
  driverName: text("driverName").notNull(),
  displayName: text("displayName").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
});

export type DeviceSelect = typeof devices.$inferSelect;
export type DeviceInsert = typeof devices.$inferInsert;

export const z_insertDevice = createInsertSchema(devices);
