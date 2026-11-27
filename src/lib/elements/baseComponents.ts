import { requiredProperties, type PropertyMap } from "$lib/propertyValue";

export type BaseComponentDefinition = {
  name: string;
  label: string;
  defaultProperties: PropertyMap;
};

export const baseComponents = {
  TagInput: {
    name: "TagInput",
    label: "Tag Input",
    defaultProperties: requiredProperties({
      id: "",
      label: "",
    }),
  },
  DeviceStatus: {
    name: "DeviceStatus",
    label: "Device Status",
    defaultProperties: requiredProperties({
      id: "",
    }),
  },
  TrendChart: {
    name: "TrendChart",
    label: "Trend Chart",
    defaultProperties: requiredProperties({
      id: "",
      stepped: false,
    }),
  },
} as const satisfies Record<string, BaseComponentDefinition>;

export const baseComponentNames = Object.keys(baseComponents);

export type BaseComponentNames = keyof typeof baseComponents;

/**
 * Checks whether a value is a known base component name.
 *
 * @param value - Candidate component name
 * @returns True when the baseComponents registry contains the name
 */
export function isBaseComponentName(value: string) {
  return Object.hasOwn(baseComponents, value);
}
