import { check, sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { tag_folders } from "./tag_folders";
import { baseTypeKeys } from "../../validation/baseTypes";
import { z_TagBindings, type TagBindings } from "../../tagBindings";
import { tagWriteLevels } from "../../permissions/constants";
import { sqlEnumList } from "./enums";

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    folderId: text("folderId").references(() => tag_folders.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    dataType: text("dataType", { enum: baseTypeKeys }).notNull(),
    type: text("type", { enum: ["tag", "udtTag"] })
      .notNull()
      .default("tag"),
    initalValue: text("intialValue"),
    nodeId: text("nodeId"),
    writeable: integer("writeable", { mode: "boolean" }).default(true),
    exposeOverOpcua: integer("exposeOverOpcua", { mode: "boolean" }).default(true),
    parameters: text("parameters", { mode: "json" }),
    unit: text("unit").notNull().default(""),
    bindings: text("bindings", { mode: "json" }).$type<TagBindings>(),
    writeLevel: text("writeLevel", { enum: tagWriteLevels }).notNull().default("operator"),
    trendEnabled: integer("trend_enabled", { mode: "boolean" }).notNull().default(false),
    trendMinimumSamplingIntervalMs: integer("trend_minimumSamplingIntervalMs")
      .notNull()
      .default(1000),
  },
  (t) => [check("tags_writeLevel_check", sql`${t.writeLevel} in (${sqlEnumList(tagWriteLevels)})`)],
);

export type TagSelect = typeof tags.$inferSelect;
export type TagInsert = typeof tags.$inferInsert;

export const z_TagSelect = createSelectSchema(tags);

export const z_TagInsert = createInsertSchema(tags, {
  bindings: () => z_TagBindings.nullable().optional(),
  type: (s) => s.default("tag"),
  writeable: (s) => s.default(true),
  exposeOverOpcua: (s) => s.default(true),
  unit: (s) => s.default(""),
  writeLevel: (s) => s.default("operator"),
  trendEnabled: (s) => s.default(false),
  trendMinimumSamplingIntervalMs: (s) => s.min(100).default(1000),
});
