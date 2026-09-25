import type { OPCUAServer, UAVariable, NodeIdLike } from "node-opcua";
import { err, ok, type Result } from "neverthrow";
import { z } from "zod";
import {
  z_insertDeviceModbusRtuOptions,
  type DeviceModbusRtuOptionsSelect,
} from "$lib/server/sqlite/tables";
import { logger } from "../../pino/logger";
import type { Tag } from "../../tag/tag";
import type { NeverThrowError } from "$lib/util/neverThrow";

type RegisterType = "hr" | "ir" | "co" | "di";

export type ModbusRTUDriverOptions = z.input<
  typeof z_insertDeviceModbusRtuOptions
>;

export type ModbusRTUDriverError = NeverThrowError & {
  options: ModbusRTUDriverOptions;
};
export class ModbusRTUDriver {
  connected: boolean = false;
  options: DeviceModbusRtuOptionsSelect;

  private constructor(
    private opcuaServer: OPCUAServer,
    options: DeviceModbusRtuOptionsSelect,
  ) {
    this.options = options;
  }

  static create(
    opcuaServer: OPCUAServer,
    opts: z.input<typeof z_insertDeviceModbusRtuOptions>,
  ): Result<ModbusRTUDriver, ModbusRTUDriverError> {
    const parsed = z_insertDeviceModbusRtuOptions.safeParse(opts);
    if (!parsed.success) {
      return err({
        reason: "OPTIONS_PARSE_ERROR",
        cause: parsed.error.message,
        options: opts,
      } as const satisfies ModbusRTUDriverError);
    }
    return ok(
      new ModbusRTUDriver(
        opcuaServer,
        parsed.data as DeviceModbusRtuOptionsSelect,
      ),
    );
  }

  connect() {
    // TD WIP Not implemented yet
    logger.warn(`[ModbusRTUDriver] connect() not implemented yet`);
  }

  disconnect() {
    this.connected = false;
    logger.warn(`[ModbusRTUDriver] disconnect() not implemented yet`);
  }

  subscribeByTag(
    tag: Tag,
    parent?: NodeIdLike,
  ): Result<UAVariable, ModbusRTUDriverError> {
    // TD WIP Not implemented yet
    logger.warn(`[ModbusRTUDriver] subscribeByTag() not implemented yet`);
    return err({
      reason: "NOT_IMPLEMENTED",
      cause: `[ModbusRTUDriver] subscribeByTag() not implemented yet`,
      options: this.options,
    } as const satisfies ModbusRTUDriverError);
  }

  unsubscribeByTag(tag: Tag): Result<void, ModbusRTUDriverError> {
    // TD WIP Not implemented yet
    logger.warn(`[ModbusRTUDriver] unsubscribeByTag() not implemented yet`);
    return ok(undefined);
  }

  dispose() {
    logger.trace(`[ModbusRTUDriver] dispose()`);
  }

  [Symbol.dispose]() {
    this.dispose();
  }
}
