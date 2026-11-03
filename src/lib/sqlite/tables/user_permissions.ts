import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import z from "zod";
import {
  permissionActions,
  permissionSubjects,
  type PermissionAction,
  type PermissionSubject,
} from "../../permissions/constants";
import { sqlEnumList } from "./enums";
import { users } from "./users";

export const user_permissions = sqliteTable(
  "user_permissions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    action: text("action", { enum: permissionActions }).notNull(),
    subject: text("subject", { enum: permissionSubjects }).notNull(),
    conditions: text("conditions", { mode: "json" }).$type<Record<string, unknown> | null>(),
    fields: text("fields", { mode: "json" }).$type<string[] | null>(),
    inverted: integer("inverted", { mode: "boolean" }).notNull().default(false),
    reason: text("reason"),
  },
  (t) => [
    index("user_permissions_user_idx").on(t.userId),
    check("user_permissions_action_check", sql`${t.action} in (${sqlEnumList(permissionActions)})`),
    check(
      "user_permissions_subject_check",
      sql`${t.subject} in (${sqlEnumList(permissionSubjects)})`,
    ),
  ],
);

export type UserPermissionSelect = typeof user_permissions.$inferSelect;
export type UserPermissionInsert = typeof user_permissions.$inferInsert;

export const z_UserPermissionSelect = createSelectSchema(user_permissions);

export const z_UserPermissionInsert = createInsertSchema(user_permissions, {
  action: z.enum(permissionActions),
  subject: z.enum(permissionSubjects),
  conditions: z.record(z.string(), z.unknown()).nullable().optional(),
  fields: z.array(z.string()).nullable().optional(),
  inverted: (s) => s.default(false),
});

export type UserPermissionAction = PermissionAction;
export type UserPermissionSubject = PermissionSubject;
