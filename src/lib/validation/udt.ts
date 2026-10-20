import z from "zod";
import { z_TagOptionsInsert } from "$lib/sqlite/tagOptions";

export const z_UdtParams = z.record(
  z.string(),
  z.union([
    z.object({ type: z.literal("string"), default: z.string() }),
    z.object({ type: z.literal("number"), default: z.number() }),
    z.object({ type: z.literal("boolean"), default: z.boolean() }),
  ]),
);

export const z_UdtDefinitionOptions = z.object({
  name: z.string(),
  parameters: z_UdtParams,
  feilds: z.array(z_TagOptionsInsert),
});
