import net from "net";
import Modbus from "jsmodbus";
import { err, ok } from "neverthrow";
import { logger } from "$lib/server/pino/logger";
import {
  z_DeviceModbusTcpOptionsInsert,
  type DeviceModbusTcpOptionsConfig,
  type DeviceModbusTcpOptionsInsert,
} from "$lib/sqlite/tables";
import { attempt } from "$lib/util/attempt";
import { errorToString } from "$lib/util/neverThrow";
import { BaseModbusDriver, type ModbusClientLike, type ModbusDriverError } from "./modbusBase";

/* -------------------------------------------------------------------------- */
/*  Driver                                                                    */
/* -------------------------------------------------------------------------- */

export type ModbusTCPDriverError = ModbusDriverError<DeviceModbusTcpOptionsInsert>;

/**
 * Modbus TCP. All protocol behaviour lives in {@link BaseModbusDriver}; this
 * class only owns the TCP socket and the jsmodbus client bound to it.
 */
export class ModbusTCPDriver extends BaseModbusDriver<
  DeviceModbusTcpOptionsConfig,
  "ModbusTCPDriver"
> {
  #socket = new net.Socket();
  #client: ModbusClientLike;

  /**
   * Creates the socket and binds a jsmodbus TCP client to it.
   *
   * @param config - Resolved Modbus TCP options.
   */
  private constructor(config: DeviceModbusTcpOptionsConfig) {
    super("ModbusTCPDriver", config);

    this.#client = new Modbus.client.TCP(
      this.#socket,
      this.options.unitId,
    ) satisfies ModbusClientLike;

    this.#socket.on("connect", () => this.onTransportUp());
    this.#socket.on("error", (e) => this.onTransportDown(e.message));
    this.#socket.on("close", () => this.onTransportDown());
  }

  /**
   * Validates options and constructs a TCP driver.
   *
   * @param opts - Unparsed Modbus TCP options.
   * @returns Ok with the driver, or Err when options are invalid or construction fails.
   */
  static create(opts: DeviceModbusTcpOptionsInsert) {
    const parsed = z_DeviceModbusTcpOptionsInsert.safeParse(opts);
    if (!parsed.success) {
      return err({
        reason: "OPTIONS_PARSE_ERROR",
        cause: parsed.error.message,
        options: opts,
      } as const satisfies ModbusTCPDriverError);
    }
    const created = attempt(() => new ModbusTCPDriver(parsed.data as DeviceModbusTcpOptionsConfig));
    if (created.isErr) {
      return err({
        reason: "DRIVER_CREATE_FAILED",
        cause: `[ModbusTCPDriver] create() ${errorToString(created.error)}`,
        options: opts,
      } as const satisfies ModbusTCPDriverError);
    }
    return ok(created.data);
  }

  /* ---------------------------- transport seam ---------------------------- */

  /** The jsmodbus TCP client bound to the socket. */
  protected get client(): ModbusClientLike {
    return this.#client;
  }

  /** Human readable `ip:port` endpoint for log lines. */
  protected targetLabel() {
    return `${this.options.ip}:${this.options.port}`;
  }

  /** Configured delay before retrying a dropped socket. */
  protected get reconnectIntervalMs() {
    return this.options.reconnectInervalMs;
  }

  /**
   * Opens the socket unless it is already connected or connecting.
   *
   * @returns Ok when connect was started, or Err when the socket could not connect.
   */
  protected openTransport() {
    if (this.connected || this.#socket.connecting) return ok(undefined);
    const connecting = attempt(() => this.#socket.connect(this.options.port, this.options.ip));
    if (connecting.isErr) {
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

  /**
   * Destroys the socket, dropping listeners first when the driver is disposed.
   *
   * @returns Always Ok; teardown cannot fail.
   */
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
