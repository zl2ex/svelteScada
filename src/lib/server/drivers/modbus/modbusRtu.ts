import { err, ok } from "neverthrow";
import { z } from "zod";
import type { NodeIdLike } from "node-opcua";
import {
  z_deviceModbusRtuOptions,
} from "$lib/server/sqlite/tables";
import { logger } from "../../pino/logger";
import type { Tag } from "../../tag/tag";
import type { NeverThrowError } from "$lib/util/neverThrow";
import type { BaseTypeStrings } from "$lib/server/tag/tag";
import {
  BaseDriver,
  type DriverValue,
  type DriverVariable,
  type SubscribeOptions,
} from "../baseDriver";

/**
 * What a caller may hand to `create()`: every field is optional and gets
 * defaulted.
 */
export type ModbusRTUDriverOptions = z.input<typeof z_deviceModbusRtuOptions>;
/** What the driver actually runs on: defaulted, so nothing is optional. */
export type ModbusRTUDriverConfig = z.output<typeof z_deviceModbusRtuOptions>;

export type ModbusRTUDriverError = NeverThrowError & {
  options: ModbusRTUDriverOptions;
};

export class ModbusRTUDriver extends BaseDriver<
  ModbusRTUDriverConfig,
  "ModbusRTUDriver"
> {
  private constructor(options: ModbusRTUDriverConfig) {
    super("ModbusRTUDriver", options);
  }

  static create(opts: ModbusRTUDriverOptions) {
    const parsed = z_deviceModbusRtuOptions.safeParse(opts);
    if (!parsed.success) {
      return err({
        reason: "OPTIONS_PARSE_ERROR",
        cause: parsed.error.message,
        options: opts,
      } as const satisfies ModbusRTUDriverError);
    }
    return ok(new ModbusRTUDriver(parsed.data));
  }

  async connect() {
    // TD WIP Not implemented yet
    logger.warn(`[ModbusRTUDriver] connect() not implemented yet`);
    return err({
      reason: "NOT_IMPLEMENTED",
      cause: `[ModbusRTUDriver] connect() not implemented yet`,
      options: this.options,
    } as const satisfies ModbusRTUDriverError);
  }

  async disconnect() {
    this.setConnected(false);
    logger.warn(`[ModbusRTUDriver] disconnect() not implemented yet`);
    return ok(undefined);
  }

  subscribe(
    _path: string,
    _dataType: BaseTypeStrings,
    _opts?: SubscribeOptions,
  ) {
    logger.warn(`[ModbusRTUDriver] subscribe() not implemented yet`);
    return err({
      reason: "NOT_IMPLEMENTED",
      cause: `[ModbusRTUDriver] subscribe() not implemented yet`,
      options: this.options,
    } as const satisfies ModbusRTUDriverError);
  }

  subscribeByTag(tag: Tag, parent?: NodeIdLike) {
    // TD WIP Not implemented yet
    logger.warn(`[ModbusRTUDriver] subscribeByTag() not implemented yet`);
    return err({
      reason: "NOT_IMPLEMENTED",
      cause: `[ModbusRTUDriver] subscribeByTag() not implemented yet`,
      options: this.options,
    } as const satisfies ModbusRTUDriverError);
  }

  unsubscribeByTag(tag: Tag) {
    // TD WIP Not implemented yet
    logger.warn(`[ModbusRTUDriver] unsubscribeByTag() not implemented yet`);
    return ok(undefined);
  }
}