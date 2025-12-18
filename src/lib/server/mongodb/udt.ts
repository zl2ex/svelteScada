import type { UdtDefinitionOptions } from "../tag/udt";
import { db } from "./db";

export const udts = db.collection<UdtDefinitionOptions>("udts");
await udts.createIndex({ name: 1 }, { unique: true });

/*
udts.insertOne({
  name: "MotorUDT",
  parameters: {
    folder: { type: "string", default: "Motors" },
    name: { type: "string", default: "M1" },
    baseAddr: { type: "number", default: 100 },
    scale: { type: "number", default: 1 },
  },
  feilds: [
    {
      name: "Running",
      parentPath: "/",
      dataType: "Boolean",
    },
    {
      name: "Speed",
      dataType: "Float",
      parentPath: "/",
      parameters: {
        address: { type: "number", default: "${baseAddr + 1}" },
        scale: { type: "number", default: "${scale * 0.01}" },
      },
    },
  ],
});
*/
