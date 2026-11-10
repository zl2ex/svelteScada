import { check, sqliteTable, text, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import z from "zod";
import { tag_folders } from "./tag_folders";
import { z_TagBindings } from "../../tagBindings";
import { tagWriteLevels } from "../../permissions/constants";
import { sqlEnumList } from "./enums";
import { tagColumns } from "./tagColumns";

export const tags = sqliteTable(
  "tags",
  {
    ...tagColumns(),
    folderId: text("folderId").references(() => tag_folders.id, {
      onDelete: "set null",
    }),
    parentTagId: text("parentTagId").references((): AnySQLiteColumn => tags.id, {
      onDelete: "cascade",
    }),
    udtDefinitionId: text("udtDefinitionId"),
    udtDefinitionChildId: text("udtDefinitionChildId"),
    udtOverrides: text("udtOverrides", { mode: "json" }).$type<Record<string, unknown>>(),
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
