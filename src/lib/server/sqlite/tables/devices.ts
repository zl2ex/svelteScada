import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const devices = sqliteTable("devices", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
});

export type Device = typeof devices.$inferSelect;
