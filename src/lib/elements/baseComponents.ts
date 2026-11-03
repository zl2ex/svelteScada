import type { TrendChartAttributes } from "$lib/client/componets/scada/TrendChart.svelte";
import type { ElementAttributes } from "./elementTypes";

export type BaseComponentDefinition = {
  name: string;
  label: string;
  defaultAttributes: ElementAttributes;
};

export const baseComponents = {
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
  TrendChart: {
    name: "TrendChart",
    label: "Trend Chart",
    defaultAttributes: {
      stepped: false,
    } satisfies TrendChartAttributes,
  },
} as const satisfies Record<string, BaseComponentDefinition>;

export const baseComponentNames = Object.keys(baseComponents);

export type BaseComponentNames = keyof typeof baseComponents;

export function isBaseComponentName(value: string) {
  return Object.hasOwn(baseComponents, value);
}
