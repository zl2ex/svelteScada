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

/**
 * Wraps a primitive value in a required PropertyValue.
 *
 * @param value - The primitive property value
 * @returns A PropertyValue marked as required
 */
export function requiredProperty(value: PropertyPrimitive): PropertyValue {
  return { value, required: true };
}

/**
 * Converts a record of primitives into a PropertyMap of required properties.
 *
 * @param values - Record of property names to primitive values
 * @returns A PropertyMap where every entry is marked required
 */
export function requiredProperties(values: Record<string, PropertyPrimitive>): PropertyMap {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, requiredProperty(value)]),
  );
}
