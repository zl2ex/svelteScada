import { z } from "zod";

export const z_TagPropertyValue = z.union([z.string(), z.number(), z.boolean()]);

export const z_TagProperties = z.record(z.string(), z_TagPropertyValue);

export type TagProperties = z.infer<typeof z_TagProperties>;
