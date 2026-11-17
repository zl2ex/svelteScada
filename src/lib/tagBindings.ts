import { z } from "zod";
import type { Bindings } from "$lib/bindings";

export const tagBindingKeys = [
  "driverPath",
  "dataType",
  "initalValue",
  "readonly",
  "exposeOverOpcua",
  "properties",
  "unit",
  "trendEnabled",
  "trendMinimumSamplingIntervalMs",
] as const;

export type TagBindingKey = (typeof tagBindingKeys)[number];
export type TagBindings = Bindings<Record<TagBindingKey, string>>;

export const z_TagBindings = z.object({
  driverPath: z.string().optional(),
  dataType: z.string().optional(),
  initalValue: z.string().optional(),
  readonly: z.string().optional(),
  exposeOverOpcua: z.string().optional(),
  properties: z.string().optional(),
  unit: z.string().optional(),
  trendEnabled: z.string().optional(),
  trendMinimumSamplingIntervalMs: z.string().optional(),
});
