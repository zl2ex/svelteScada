import z from "zod";
import { newId } from "$lib/util/newId";

// Base schemas for primitives
export const Z_BaseTypes = {
  Boolean: z.boolean().default(false),
  String: z.string().default(""),
  UInt16: z.number().int().min(0).max(65535).default(0),
  Int16: z.number().int().min(-32768).max(32767).default(0),
  UInt32: z.number().int().min(0).max(4294967295).default(0),
  Int32: z.number().int().min(-2147483648).max(2147483647).default(0),
  UInt64: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
  Int64: z
    .number()
    .int()
    .min(Number.MIN_SAFE_INTEGER)
    .max(Number.MAX_SAFE_INTEGER)
    .default(0),
  Float: z
    .number()
    .min(-3.4028234663852886e38)
    .max(3.4028234663852886e38)
    .default(0),
  Double: z.number().min(Number.MIN_VALUE).max(Number.MAX_VALUE).default(0),
} as const;

// runtime array of keys, typed as a tuple of literal strings
export const baseTypeKeys = Object.keys(Z_BaseTypes) as [
  keyof typeof Z_BaseTypes,
];

// shared schemas should match the ones in /lib/server/sqlite/tables
export const z_shared_insertTagFolder = z.object({
  id: z.string().optional().default(newId()),
  name: z.string(),
});

export const z_shared_insertClosureTableNode = z_shared_insertTagFolder.extend({
  parentId: z.string().nullable(),
});

export const z_shared_insertTag = z.object({
  id: z.string().optional().default(newId()),
  folderId: z.string().nullable().optional(),
  name: z.string(),
  dataType: z.enum(baseTypeKeys),
  value: z.string().nullable().optional(),
  nodeId: z.string().nullable().optional(),
  writeable: z.boolean().optional(),
  exposeOverOpcua: z.boolean().optional(),
  parameters: z.any().nullable().optional(),
});

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
  feilds: z.array(z_shared_insertTag),
});
