import { check, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import z from "zod";
import { userRoles } from "../../permissions/constants";
import { sqlEnumList } from "./enums";

export const users = sqliteTable(
  "users",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    email: text("email").notNull(),
    password: text("password").notNull(),
    role: text("role", { enum: userRoles }).notNull().default("viewer"),
  },
  (t) => [check("users_role_check", sql`${t.role} in (${sqlEnumList(userRoles)})`)],
);

export type UserSelect = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;

export const z_UserSelect = createSelectSchema(users);

export const z_UserInsert = createInsertSchema(users, {
  email: z.email(),
  role: (s) => s.default("viewer"),
});

export const z_UserLogin = z_UserInsert.omit({ name: true, id: true, role: true });
