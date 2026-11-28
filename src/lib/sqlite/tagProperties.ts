import { z } from "zod";
import { z_PropertyMap, z_PropertyValue } from "../../lib/propertyValue";

export const z_TagPropertyValue = z_PropertyValue;

export const z_TagProperties = z_PropertyMap;

export type TagProperties = z.input<typeof z_TagProperties>;
