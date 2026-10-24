import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { projects } from "./projects";
import type { UserComponentPropDefinition } from "../../page/elementTypes";

export const user_components = sqliteTable(
  "user_components",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("projectId")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    props: text("props", { mode: "json" })
      .$type<UserComponentPropDefinition[]>()
      .notNull()
      .default([]),
    createdAt: integer("createdAt", { mode: "number" })
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer("updatedAt", { mode: "number" })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (t) => [uniqueIndex("user_components_project_name_unique").on(t.projectId, t.name)],
);

export type UserComponentSelect = typeof user_components.$inferSelect;
export type UserComponentInsert = typeof user_components.$inferInsert;

export const z_UserComponentSelect = createSelectSchema(user_components);

export const z_UserComponentInsert = createInsertSchema(user_components);
