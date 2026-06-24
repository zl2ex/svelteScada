import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import z from "zod";
import { user_permissions } from "./user-permissions";

export const user = sqliteTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  email: text("email").notNull(),
  password: text("password").notNull(),
  permissionsFk: text("permissionsFK").references(() => user_permissions.id, {
    onDelete: "cascade",
  }),
});

export type User = typeof user.$inferSelect;

export const z_insertUser = z
  .object({
    ...createInsertSchema(user, {
      email: z.email(),
    }).shape,
  })
  .omit({
    permissionsFk: true,
  });

export const z_loginUser = z
  .object({
    ...createInsertSchema(user, {
      email: z.email(),
    }).shape,
  })
  .omit({ name: true, permissionsFk: true });
