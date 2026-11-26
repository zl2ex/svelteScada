import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { routeSegmentPattern } from "../../elements/elementTypes";
import { user_theme } from "./user_theme";

export const projects = sqliteTable("projects", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
  version: text("version").notNull().default("0.0.0"),
  description: text("description"),
  themeId: text("themeId").references(() => user_theme.id, { onDelete: "set null" }),
  grid_enabled: integer("grid_enabled", { mode: "boolean" })
    .notNull()
    .default(true),
  grid_spacing: integer("grid_spacing")
    .notNull()
    .default(5),
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
  grid_spacing: (schema) => schema.min(1).max(200).default(5),
  grid_enabled: (schema) => schema.default(true),
  createdAt: (schema) => schema.default(() => Date.now()),
  updatedAt: (schema) => schema.default(() => Date.now()),
});

export const z_ProjectGrid = z_ProjectInsert.pick({
  grid_enabled: true,
  grid_spacing: true,
});
