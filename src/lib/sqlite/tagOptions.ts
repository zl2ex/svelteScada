import z from "zod";
import { z_TagInsert } from "./tables";

/**
 * The tag row is the unit the tag manager and editor work with. Trend options
 * are stored as flat columns on `tags`.
 */
export const z_TagOptionsInsert = z_TagInsert;

type BaseTagOptionsInput = z.input<typeof z_TagOptionsInsert>;

export type UdtDefinitionChild = Omit<
  BaseTagOptionsInput,
  "folderId" | "parentTagId" | "udtDefinitionId" | "udtDefinitionChildId" | "udtOverrides"
>;

export type UdtTagOverrides = Partial<Omit<UdtDefinitionChild, "id" | "type">>;

export type TagOptionsInput = Omit<BaseTagOptionsInput, "udtOverrides"> & {
  udtOverrides?: UdtTagOverrides | null;
};
