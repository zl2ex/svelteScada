import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { projects } from "./projects";
import { containerTypes, routeSegmentPattern } from "../../page/elementTypes";

export const pages = sqliteTable(
  "pages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("projectId")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    containerType: text("containerType", { enum: containerTypes }).notNull().default("absolute"),
    sortIndex: integer("sortIndex").notNull().default(0),
    createdAt: integer("createdAt", { mode: "number" })
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer("updatedAt", { mode: "number" })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (t) => [
    index("pages_project_idx").on(t.projectId),
    uniqueIndex("pages_project_name_unique").on(t.projectId, t.name),
  ],
);

export type PageSelect = typeof pages.$inferSelect;
export type PageInsert = typeof pages.$inferInsert;

export const z_PageSelect = createSelectSchema(pages);

export const z_PageInsert = createInsertSchema(pages, {
  name: (schema) => schema.regex(routeSegmentPattern).min(1).max(64),
});
