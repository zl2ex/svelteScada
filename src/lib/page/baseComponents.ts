import type { ElementAttributes } from "./elementTypes";

export type BaseComponentDefinition = {
  name: string;
  label: string;
  defaultAttributes: ElementAttributes;
};

export const baseComponents: Record<string, BaseComponentDefinition> = {
  TagInput: {
    name: "TagInput",
    label: "Tag Input",
    defaultAttributes: {
      id: "",
      label: "",
    },
  },
  DeviceStatus: {
    name: "DeviceStatus",
    label: "Device Status",
    defaultAttributes: {
      id: "",
    },
  },
};

export const baseComponentNames = Object.keys(baseComponents);

export function isBaseComponentName(value: string) {
  return Object.hasOwn(baseComponents, value);
}
