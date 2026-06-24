import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const displays = sqliteTable("displays", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
});

export type Display = typeof displays.$inferSelect;
