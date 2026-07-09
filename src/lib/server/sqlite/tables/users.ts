import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
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

export const z_insertUser = createInsertSchema(users, {
  email: z.email(),
});

export const z_loginUser = createInsertSchema(users, {
  email: z.email(),
}).omit({ name: true, id: true });
