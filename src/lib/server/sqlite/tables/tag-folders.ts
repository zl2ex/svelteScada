import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import z from "zod";

export const tag_folders = sqliteTable("tag_folders", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
});

export type TagFolder = typeof tag_folders.$inferSelect;

export const z_insertTagFolder = z.object({
  ...createInsertSchema(tag_folders).shape,
});
