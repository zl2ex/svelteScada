import { type DeviceOptions } from "../drivers/driver";
import { db } from "./db";

export const devices = db.collection<DeviceOptions>("devices");
await devices.createIndex({ name: 1 }, { unique: true });
