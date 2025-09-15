import {
  OPCUAServer,
  Variant,
  DataType,
  StatusCodes,
  type Namespace,
  type NodeIdLike,
  MonitoredItem,
  MonitoringMode,
} from "node-opcua";

import Modbus, { ModbusRTUClient } from "jsmodbus";
import net from "net";
import { z } from "zod";

type RegisterType = "hr" | "ir" | "co" | "di";

export const Z_ModbusRTUDriverOptions = z.object({
  serialPort: z.string(),
  baudRate: z.number().int(),
  parity: z.enum(["none", "even", "odd"]),
  unitId: z.number().int().optional(),
  spanGaps: z.boolean().optional(),
});

export type ModbusRTUDriverOptions = z.infer<typeof Z_ModbusRTUDriverOptions>;
