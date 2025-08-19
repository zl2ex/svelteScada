export const tagDefinitions = {
  Local: {
    Temperature: {
      nodeId: "ns=1;s=Local.Temperature",
      dataType: "Double",
      initialValue: 22
    },
    Status: {
      nodeId: "ns=1;s=Local.Status",
      dataType: "Double[10]"
    },
    /*udtTest: {
      nodeId: "ns=1;s=Local.Status",
      dataType: "Scaling",
      parameters: {
        path: "ns=1;s=PLC1"
      }
    }*/
  },
  Settings: {
    User: {
      nodeId: "ns=1;s=Settings.User",
      dataType: "String",
      initialValue: "admin"
    }
  }
} as const;