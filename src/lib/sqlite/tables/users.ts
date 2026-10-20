import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import z from "zod";

export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  email: text("email").notNull(),
  password: text("password").notNull(),
});

export type UserSelect = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;

export const z_UserSelect = createSelectSchema(users);

export const z_UserInsert = createInsertSchema(users, {
  email: z.email(),
});

export const z_UserLogin = z_UserInsert.omit({ name: true, id: true });
