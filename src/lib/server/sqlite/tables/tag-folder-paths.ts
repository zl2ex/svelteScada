import { sqliteTable, integer, text, primaryKey } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import z from "zod";
import { tag_folders } from "./tag-folders";

export const tag_folder_paths = sqliteTable(
  "tag_folder_paths",
  {
    ancestor: text("ancestor")
      .notNull()
      .references(() => tag_folders.id, { onDelete: "cascade" }),
    descendant: text("descendant")
      .notNull()
      .references(() => tag_folders.id, { onDelete: "cascade" }),
    depth: integer("depth").notNull(),
  },
  (t) => [primaryKey({ columns: [t.ancestor, t.descendant] })],
);

export type TagFolderPaths = typeof tag_folder_paths.$inferSelect;

export const z_insertTagFolderPaths = z.object({
  ...createInsertSchema(tag_folder_paths).shape,
});
