import {
  sqliteTable,
  integer,
  text,
  primaryKey,
} from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import z from "zod";
import { tag_folders } from "./tag-folders";

export const tag_folder_paths = sqliteTable(
  "tag_folder_paths",
  {
    parent: text("parent")
      .notNull()
      .references(() => tag_folders.id, { onDelete: "cascade" }),
    child: text("child")
      .notNull()
      .references(() => tag_folders.id, { onDelete: "cascade" }),
    depth: integer("depth").notNull(),
  },
  (t) => [primaryKey({ columns: [t.parent, t.child] })],
);

export type TagFolderPaths = typeof tag_folder_paths.$inferSelect;

export const z_insertTagFolderPaths = z.object({
  ...createInsertSchema(tag_folder_paths).shape,
});
