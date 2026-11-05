import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const user_theme = sqliteTable("user_theme", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
  projectStyle: text("projectStyle").notNull(),
  createdAt: integer("createdAt", { mode: "number" })
    .notNull()
    .$defaultFn(() => Date.now()),
  updatedAt: integer("updatedAt", { mode: "number" })
    .notNull()
    .$defaultFn(() => Date.now()),
});

export type UserThemeSelect = typeof user_theme.$inferSelect;
export type UserThemeInsert = typeof user_theme.$inferInsert;

export const z_UserThemeSelect = createSelectSchema(user_theme);
export const z_UserThemeInsert = createInsertSchema(user_theme);
