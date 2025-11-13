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
import { Z_Endian } from "./modbusTcp";

type RegisterType = "hr" | "ir" | "co" | "di";

export const Z_ModbusRTUDriverOptions = z.object({
  serialPort: z.string(),
  baudRate: z.number().int(),
  parity: z.enum(["none", "even", "odd"]),
  unitId: z.number().int().optional(),
  spanGaps: z.coerce.boolean<boolean>().default(false),
  pollingIntervalMs: z.number().int().min(500).optional().default(1000),
  startAddress: z.number().min(0).max(1).optional().default(0),
  endian: Z_Endian.optional().default("LittleEndian"),
});

export type ModbusRTUDriverOptions = z.infer<typeof Z_ModbusRTUDriverOptions>;
