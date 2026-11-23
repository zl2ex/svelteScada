import { z } from "zod";

export const z_PropertyValue = z.object({
  value: z.union([z.string(), z.number(), z.boolean()]),
  description: z.string().optional(),
  required: z.boolean().default(true),
});

export const z_PropertyMap = z.record(z.string(), z_PropertyValue);

export type PropertyPrimitive = string | number | boolean;

export type PropertyValue = {
  value: PropertyPrimitive;
  description?: string;
  required: boolean;
};

export type PropertyMap = Record<string, PropertyValue>;

export function requiredProperty(value: PropertyPrimitive): PropertyValue {
  return { value, required: true };
}

export function requiredProperties(values: Record<string, PropertyPrimitive>): PropertyMap {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, requiredProperty(value)]),
  );
}
