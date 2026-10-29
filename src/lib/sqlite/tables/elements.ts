import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { pages } from "./pages";
import { user_components } from "./user_components";
import {
  containerTypes,
  elementKinds,
  type ElementAttributes,
  type ElementBindings,
  type ElementStyle,
} from "../../page/elementTypes";

export const elements = sqliteTable(
  "elements",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    pageId: text("pageId").references(() => pages.id, { onDelete: "cascade" }),
    userComponentId: text("userComponentId").references(() => user_components.id, {
      onDelete: "cascade",
    }),
    sortIndex: integer("sortIndex").notNull().default(0),
    kind: text("kind", { enum: elementKinds }).notNull(),
    tag: text("tag"),
    baseComponent: text("baseComponent"),
    referencedComponentId: text("referencedComponentId").references(() => user_components.id, {
      onDelete: "restrict",
    }),
    name: text("name").notNull().default(""),
    text: text("text"),
    containerType: text("containerType", { enum: containerTypes }).notNull().default("none"),
    attributes: text("attributes", { mode: "json" })
      .$type<ElementAttributes>()
      .notNull()
      .default({}),
    style: text("style", { mode: "json" }).$type<ElementStyle>().notNull().default({}),
    bindings: text("bindings", { mode: "json" }).$type<ElementBindings>(),
    createdAt: integer("createdAt", { mode: "number" })
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer("updatedAt", { mode: "number" })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (t) => [
    index("elements_page_idx").on(t.pageId),
    index("elements_user_component_idx").on(t.userComponentId),
    index("elements_referenced_component_idx").on(t.referencedComponentId),
    check(
      "elements_owner_check",
      sql`((${t.pageId} IS NOT NULL) + (${t.userComponentId} IS NOT NULL)) = 1`,
    ),
    check(
      "elements_kind_check",
      sql`(
        (${t.kind} IN ('html', 'svg') AND ${t.tag} IS NOT NULL AND ${t.baseComponent} IS NULL AND ${t.referencedComponentId} IS NULL)
        OR (${t.kind} = 'base-component' AND ${t.tag} IS NULL AND ${t.baseComponent} IS NOT NULL AND ${t.referencedComponentId} IS NULL)
        OR (${t.kind} = 'user-component' AND ${t.tag} IS NULL AND ${t.baseComponent} IS NULL AND ${t.referencedComponentId} IS NOT NULL)
      )`,
    ),
  ],
);

export type ElementSelect = typeof elements.$inferSelect;
export type ElementInsert = typeof elements.$inferInsert;

export const z_ElementSelect = createSelectSchema(elements);

export const z_ElementInsert = createInsertSchema(elements);
