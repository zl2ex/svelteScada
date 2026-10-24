import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { routeSegmentPattern } from "../../page/elementTypes";

export const projects = sqliteTable("projects", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
  version: text("version").notNull().default("0.0.0"),
  description: text("description"),
  createdAt: integer("createdAt", { mode: "number" })
    .notNull()
    .$defaultFn(() => Date.now()),
  updatedAt: integer("updatedAt", { mode: "number" })
    .notNull()
    .$defaultFn(() => Date.now()),
});

export type ProjectSelect = typeof projects.$inferSelect;
export type ProjectInsert = typeof projects.$inferInsert;

export const z_ProjectSelect = createSelectSchema(projects);

export const z_ProjectInsert = createInsertSchema(projects, {
  name: (schema) => schema.regex(routeSegmentPattern).min(1).max(64),
});
