import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
export const tag_folders = sqliteTable("tag_folders", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
});

export type TagFolderSelect = typeof tag_folders.$inferSelect;
export type TagFolderInsert = typeof tag_folders.$inferInsert;

export const z_insertTagFolder = createInsertSchema(tag_folders);
