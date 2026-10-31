import { z } from "zod";
import type { Bindings } from "$lib/bindings";

export const tagBindingKeys = [
  "nodeId",
  "dataType",
  "initalValue",
  "writeable",
  "exposeOverOpcua",
  "parameters",
  "unit",
  "trend",
] as const;

export type TagBindingKey = (typeof tagBindingKeys)[number];
export type TagBindings = Bindings<Record<TagBindingKey, string>>;

export const z_TagBindings = z.object({
  nodeId: z.string().optional(),
  dataType: z.string().optional(),
  initalValue: z.string().optional(),
  writeable: z.string().optional(),
  exposeOverOpcua: z.string().optional(),
  parameters: z.string().optional(),
  unit: z.string().optional(),
  trend: z.string().optional(),
});
