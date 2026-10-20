import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { newId } from "../../util/newId";
export const tag_folders = sqliteTable("tag_folders", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
});

export type TagFolderSelect = typeof tag_folders.$inferSelect;
export type TagFolderInsert = typeof tag_folders.$inferInsert;

export const z_TagFolderSelect = createSelectSchema(tag_folders);

export const z_TagFolderInsert = createInsertSchema(tag_folders);

/**
 * A folder plus its place in the closure tree. The parent lives in
 * `tag_folder_paths`, so it is not a column on the table itself.
 */
export const z_TagFolderNodeInsert = z_TagFolderInsert.extend({
  id: z.string().default(() => newId()),
  parentId: z.string().nullable(),
});
