import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
export const displays = sqliteTable("displays", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
});

export type DisplaySelect = typeof displays.$inferSelect;
export type DisplayInsert = typeof displays.$inferInsert;

export const z_insertDisplay = createInsertSchema(displays);
