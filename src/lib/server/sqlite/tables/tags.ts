import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { tag_folders } from "./tag_folders";

export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  folderId: text("folderId").references(() => tag_folders.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  dataType: text("dataType").notNull(),
  type: text("type", { enum: ["tag", "udtTag"] })
    .notNull()
    .default("tag"),
  value: real("value"),
  nodeId: text("nodeId"),
  writeable: integer("writeable", { mode: "boolean" }).default(true),
  exposeOverOpcua: integer("exposeOverOpcua", { mode: "boolean" }).default(
    true,
  ),
  parameters: text("parameters", { mode: "json" }),
});

export type TagSelect = typeof tags.$inferSelect;
export type TagInsert = typeof tags.$inferInsert;

export const z_insertTag = createInsertSchema(tags);
