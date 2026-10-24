import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { elements } from "./elements";

export const element_paths = sqliteTable(
  "element_paths",
  {
    parent: text("parent")
      .notNull()
      .references(() => elements.id, { onDelete: "cascade" }),
    child: text("child")
      .notNull()
      .references(() => elements.id, { onDelete: "cascade" }),
    depth: integer("depth").notNull(),
  },
  (t) => [primaryKey({ columns: [t.parent, t.child] })],
);

export type ElementPathSelect = typeof element_paths.$inferSelect;
export type ElementPathInsert = typeof element_paths.$inferInsert;

export const z_ElementPathSelect = createSelectSchema(element_paths);

export const z_ElementPathInsert = createInsertSchema(element_paths);
