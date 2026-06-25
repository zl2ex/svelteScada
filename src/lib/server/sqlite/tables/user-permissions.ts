import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import z from "zod";
import { user } from "./user";

export const user_permissions = sqliteTable("user_permissions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  read: integer("read", { mode: "boolean" }).default(false),
  write: integer("write", { mode: "boolean" }).default(false),
  edit: integer("edit", { mode: "boolean" }).default(false),
});

export type UserPermissions = typeof user_permissions.$inferSelect;

export const z_insertUserPermissions = z.object({
  ...createInsertSchema(user_permissions, {}).shape,
});
