import z from "zod";
import { Z_NodeOptions } from "../../../lib/client/tag/clientTag.svelte";

// Base schemas for primitives
export const Z_BaseTypes = {
  Double: z.number().default(0),
  Int16: z.number().int().max(65535).default(0),
  Int32: z.number().int().max(4294967295).default(0), // TD WIP max and min
  Boolean: z.boolean().default(false),
  String: z.string().default(""),
} as const;

const Z_NodeOptionsWithoutType = Z_NodeOptions.omit({ type: true });
const __Z_TagOptionsInput = Z_NodeOptionsWithoutType.extend({
  dataType: z.string(), // TD WIP Tighten type ?
  nodeId: z.string().optional(),
  writeable: z.boolean().optional().default(false),
  initalValue: z.any().optional(),
  parameters: z.object(), //Z_UdtParams.optional(), //TD UDT PARAM WIP
  exposeOverOpcua: z.boolean().optional().default(false),
});

export const Z_TagOptionsInput = __Z_TagOptionsInput.extend({
  children: z.record(z.string(), __Z_TagOptionsInput).optional(),
});

export const Z_tagOptionsInputForm = Z_TagOptionsInput.extend({
  path: z.string(),
});

export const Z_TagOptionsResolved = Z_NodeOptionsWithoutType.extend({
  path: z.string(),
  dataType: z.string(), // TD WIP Tighten type ?
  nodeId: z.string().optional(),
  writeable: z.boolean().optional().default(false),
  initalValue: z.any().optional(),
  parameters: z.object(), //Z_UdtParams.optional(), //TD UDT PARAM WIP
  exposeOverOpcua: z.boolean().optional().default(false),
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
  feilds: z.array(Z_TagOptionsInput),
});
