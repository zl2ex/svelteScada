import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import z from "zod";
import { tag_folders } from "./tag-folders";

export const tag = sqliteTable("tag", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  folderId: text("folderId").references(() => tag_folders.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  dataType: text("dataType").notNull(),
  value: real("value"),
  nodeId: text("nodeId"),
  writeable: integer("writeable", { mode: "boolean" }).$default(() => true),
  exposeOverOpcua: integer("exposeOverOpcua", { mode: "boolean" }).$default(
    () => true,
  ),
  parameters: text("parameters", { mode: "json" }),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
});

export type TagSelect = typeof tag.$inferSelect;

export const z_insertTag = z.object({ ...createInsertSchema(tag) }.shape);
