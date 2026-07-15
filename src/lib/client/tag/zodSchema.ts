import { z_insertTag } from "$lib/server/sqlite/tables";
import z from "zod";

// Base schemas for primitives
export const Z_BaseTypes = {
  Double: z.number().default(0),
  Int16: z.number().int().max(65535).default(0),
  Int32: z.number().int().max(4294967295).default(0), // TD WIP max and min
  Boolean: z.boolean().default(false),
  String: z.string().default(""),
} as const;

export const Z_UdtParams = z.record(
  z.string(),
  z.union([
    z.object({ type: z.literal("string"), default: z.string() }),
    z.object({ type: z.literal("number"), default: z.number() }),
    z.object({ type: z.literal("boolean"), default: z.boolean() }),
  ]),
);

export const Z_UdtDefinitionOptions = z.object({
  name: z.string(),
  parameters: Z_UdtParams,
  feilds: z.array(z_insertTag),
});
