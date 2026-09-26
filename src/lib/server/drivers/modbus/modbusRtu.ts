import type { OPCUAServer, NodeIdLike } from "node-opcua";
import { err, ok } from "neverthrow";
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
  reason: "OPTIONS_PARSE_ERROR" | "NOT_IMPLEMENTED";
  options: ModbusRTUDriverOptions;
};
type ConnectionListener = (connected: boolean) => void;

export class ModbusRTUDriver {
  connected: boolean = false;
  options: DeviceModbusRtuOptionsSelect;
  /** fired whenever `connected` flips, see onConnectedChange() */
  private connectionListeners = new Set<ConnectionListener>();

  private constructor(
    private opcuaServer: OPCUAServer,
    options: DeviceModbusRtuOptionsSelect,
  ) {
    this.options = options;
  }

  static create(
    opcuaServer: OPCUAServer,
    opts: z.input<typeof z_insertDeviceModbusRtuOptions>,
  ) {
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

  /**
   * Subscribe to connection state changes. Called once immediately with the
   * current state, then on every change. Returns an unsubscribe function.
   */
  onConnectedChange(cb: ConnectionListener) {
    const entry: ConnectionListener = (connected) => cb(connected);
    this.connectionListeners.add(entry);
    entry(this.connected);
    return () => {
      this.connectionListeners.delete(entry);
    };
  }

  private setConnected(next: boolean) {
    if (this.connected === next) return;
    this.connected = next;
    for (const cb of this.connectionListeners) {
      try {
        cb(next);
      } catch (e) {
        logger.error(
          e,
          `[ModbusRTUDriver] connection listener for ${this.options.serialPort} threw`,
        );
      }
    }
  }

  connect() {
    // TD WIP Not implemented yet
    logger.warn(`[ModbusRTUDriver] connect() not implemented yet`);
    return err({
      reason: "NOT_IMPLEMENTED",
      cause: `[ModbusRTUDriver] connect() not implemented yet`,
      options: this.options,
    } as const satisfies ModbusRTUDriverError);
  }

  disconnect() {
    this.setConnected(false);
    logger.warn(`[ModbusRTUDriver] disconnect() not implemented yet`);
    return ok(undefined);
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

  dispose() {
    this.setConnected(false);
    this.connectionListeners.clear();
    logger.trace(`[ModbusRTUDriver] dispose()`);
  }

  [Symbol.dispose]() {
    this.dispose();
  }
}
