import type { UdtTypes } from "./udt";
export const udtDefinitions = {
  Scaling: {
    parameters: {
      path: "ns=1;s="
    },
    fields: {
      max: {
        nodeId: "${path}.max",
        dataType: "Double",
        initialValue: 1
      },
      min: {
        nodeId: "${path}.min",
        dataType: "Double[5]",
        initialValue: [],
      }
    }
  }
} as const satisfies UdtTypes;