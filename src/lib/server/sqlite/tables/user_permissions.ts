import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { users } from "./users";

export const user_permissions = sqliteTable("user_permissions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  read: integer("read", { mode: "boolean" }).default(false),
  write: integer("write", { mode: "boolean" }).default(false),
  edit: integer("edit", { mode: "boolean" }).default(false),
});

export type UserPermissionsSelect = typeof user_permissions.$inferSelect;
export type UserPermissionsInsert = typeof user_permissions.$inferInsert;

export const z_insertUserPermissions = createInsertSchema(user_permissions, {});
