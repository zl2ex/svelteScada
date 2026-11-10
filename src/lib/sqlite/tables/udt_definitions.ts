import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import z from "zod";
import { z_TagInsert } from "./tags";
import type { UdtDefinitionChild } from "../tagOptions";

const z_ElementAttributes = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]));

export const udt_definitions = sqliteTable("udt_definitions", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  props: text("props", { mode: "json" })
    .$type<Record<string, string | number | boolean>>()
    .notNull(),
  children: text("children", { mode: "json" }).$type<UdtDefinitionChild[]>().notNull(),
});

export type UdtDefinitionSelect = typeof udt_definitions.$inferSelect;
export type UdtDefinitionInsert = typeof udt_definitions.$inferInsert;

export const z_UdtDefinitionSelect = createSelectSchema(udt_definitions, {
  props: () => z_ElementAttributes.default({}),
});

export const z_UdtDefinitionChild = z_TagInsert
  .omit({
    folderId: true,
    parentTagId: true,
    udtDefinitionId: true,
    udtDefinitionChildId: true,
    udtOverrides: true,
  })
  .extend({ id: z.string().min(1) });

export const z_UdtDefinitionInsert = createInsertSchema(udt_definitions, {
  name: (schema) => schema.min(1),
  props: () => z_ElementAttributes.default({}),
  children: () => z.array(z_UdtDefinitionChild).default([]),
});

export const z_UdtDefinitionInput = z_UdtDefinitionInsert.extend({
  id: z.string().min(1),
  children: z.array(z_UdtDefinitionChild).default([]),
});

export type UdtDefinitionInput = z.infer<typeof z_UdtDefinitionInput>;
export type UdtDefinitionTagInput = z.infer<typeof z_UdtDefinitionChild>;
