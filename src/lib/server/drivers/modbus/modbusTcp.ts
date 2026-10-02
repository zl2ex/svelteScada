import net from "net";
import Modbus from "jsmodbus";
import { err, ok } from "neverthrow";
import { z } from "zod";
import { logger } from "$lib/server/pino/logger";
import { z_deviceModbusTcpOptions } from "$lib/server/sqlite/tables";
import { attempt } from "$lib/util/attempt";
import { errorToString } from "$lib/util/neverThrow";
import {
  BaseModbusDriver,
  type ModbusClientLike,
  type ModbusDriverError,
} from "./modbusBase";

/* -------------------------------------------------------------------------- */
/*  Driver                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * What a caller may hand to `create()`: every field is optional and gets
 * defaulted.
 */
export type ModbusTCPDriverOptions = z.input<typeof z_deviceModbusTcpOptions>;
/** What the driver actually runs on: defaulted, so nothing is optional. */
export type ModbusTCPDriverConfig = z.output<typeof z_deviceModbusTcpOptions>;
export type ModbusTCPDriverError = ModbusDriverError<ModbusTCPDriverOptions>;

/**
 * Modbus TCP. All protocol behaviour lives in {@link BaseModbusDriver}; this
 * class only owns the TCP socket and the jsmodbus client bound to it.
 */
export class ModbusTCPDriver extends BaseModbusDriver<
  ModbusTCPDriverConfig,
  "ModbusTCPDriver"
> {
  #socket = new net.Socket();
  #client: ModbusClientLike;

  private constructor(config: ModbusTCPDriverConfig) {
    super("ModbusTCPDriver", config);

    this.#client = new Modbus.client.TCP(
      this.#socket,
      this.options.unitId,
    ) satisfies ModbusClientLike;

    this.#socket.on("connect", () => this.onTransportUp());
    this.#socket.on("error", (e) => this.onTransportDown(e.message));
    this.#socket.on("close", () => this.onTransportDown());
  }

  static create(opts: ModbusTCPDriverOptions) {
    const parsed = z_deviceModbusTcpOptions.safeParse(opts);
    if (!parsed.success) {
      return err({
        reason: "OPTIONS_PARSE_ERROR",
        cause: parsed.error.message,
        options: opts,
      } as const satisfies ModbusTCPDriverError);
    }
    const created = attempt(
      () => new ModbusTCPDriver(parsed.data as ModbusTCPDriverConfig),
    );
    if (created.error) {
      return err({
        reason: "DRIVER_CREATE_FAILED",
        cause: `[ModbusTCPDriver] create() ${errorToString(created.error)}`,
        options: opts,
      } as const satisfies ModbusTCPDriverError);
    }
    return ok(created.data);
  }

  /* ---------------------------- transport seam ---------------------------- */

  protected get client(): ModbusClientLike {
    return this.#client;
  }

  protected targetLabel() {
    return `${this.options.ip}:${this.options.port}`;
  }

  protected get reconnectIntervalMs() {
    return this.options.reconnectInervalMs;
  }

  protected openTransport() {
    if (this.connected || this.#socket.connecting) return ok(undefined);
    const connecting = attempt(() =>
      this.#socket.connect(this.options.port, this.options.ip),
    );
    if (connecting.error) {
      this.setConnected(false);
      return err({
        reason: "SOCKET_CONNECT_FAILED",
        cause: `socket.connect() to ${this.targetLabel()} failed: ${errorToString(
          connecting.error,
        )}`,
        options: this.options,
      } as const satisfies ModbusTCPDriverError);
    }
    return ok(undefined);
  }

  protected closeTransport() {
    if (this.disposed) {
      // drop listeners first so a late socket error cannot reach a dead driver
      this.#socket.removeAllListeners();
      this.#socket.on("error", () => {}); // swallow late errors after teardown
    }
    this.#socket.destroy();
    return ok(undefined);
  }
}
