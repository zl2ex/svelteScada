import { db } from "./db";
import { type UdtOptions } from "../udt/udt";

export const udts = db.collection<UdtOptions>("udts");
await udts.createIndex({ name: 1 }, { unique: true });

udts.insertOne({
  name: "MotorUDT",
  props: {
    folder: { type: "string", default: "Motors" },
    name: { type: "string", default: "M1" },
    baseAddr: { type: "number", default: 100 },
    scale: { type: "number", default: 1 },
  },
  children: [
    {
      name: "Running",
      dataType: "Boolean",
      path: "/${folder}/${name}/Running",
      address: "${baseAddr}",
    },
    {
      name: "Speed",
      dataType: "Float",
      path: "/${folder}/${name}/Speed",
      address: "${baseAddr + 1}",
      scale: "${scale * 0.01}",
    },
  ],
});
