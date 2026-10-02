import Modbus from "jsmodbus";
import { err, ok } from "neverthrow";
import { z } from "zod";
import { SerialPort } from "serialport";
import { logger } from "$lib/server/pino/logger";
import { z_deviceModbusRtuOptions } from "$lib/server/sqlite/tables";
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
export type ModbusRTUDriverOptions = z.input<typeof z_deviceModbusRtuOptions>;
/** What the driver actually runs on: defaulted, so nothing is optional. */
export type ModbusRTUDriverConfig = z.output<typeof z_deviceModbusRtuOptions>;
export type ModbusRTUDriverError = ModbusDriverError<ModbusRTUDriverOptions>;

/**
 * Modbus RTU over a serial port.
 *
 * All protocol behaviour lives in {@link BaseModbusDriver}. RTU is
 * connectionless at the protocol level, so this class owns nothing but the
 * `SerialPort` and the jsmodbus client bound to it - though the port can still
 * disappear (unplugged USB adapter), which is what the inherited reconnect loop
 * covers.
 */
export class ModbusRTUDriver extends BaseModbusDriver<
  ModbusRTUDriverConfig,
  "ModbusRTUDriver"
> {
  #port: SerialPort;
  #client: ModbusClientLike;

  private constructor(config: ModbusRTUDriverConfig) {
    super("ModbusRTUDriver", config);

    // autoOpen is false so the client below can attach its 'open' listener
    // before anything opens; `dataBits: 8` is fixed by the Modbus spec.
    this.#port = new SerialPort({
      path: config.serialPort,
      baudRate: config.baudRate,
      parity: config.parity,
      dataBits: 8,
      autoOpen: false,
    });
    this.#client = new Modbus.client.RTU(
      this.#port,
      this.options.unitId,
    ) satisfies ModbusClientLike;

    // The port is reused across reconnects: closing it only tears down the
    // underlying binding, and re-opening builds a fresh one, which is what
    // makes a re-plugged USB adapter come back.
    this.#port.on("open", () => this.onTransportUp());
    // a failed read/write closes the port and reports the cause here
    this.#port.on("close", (disconnectError?: Error) =>
      this.onTransportDown(disconnectError?.message),
    );
    this.#port.on("error", (e) => this.onTransportDown(e.message));
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
    if (!parsed.data.serialPort) {
      return err({
        reason: "SERIAL_PORT_REQUIRED",
        cause: `[ModbusRTUDriver] create() serialPort is empty`,
        options: opts,
      } as const satisfies ModbusRTUDriverError);
    }
    const created = attempt(
      () => new ModbusRTUDriver(parsed.data as ModbusRTUDriverConfig),
    );
    if (created.error) {
      return err({
        reason: "DRIVER_CREATE_FAILED",
        cause: `[ModbusRTUDriver] create() ${errorToString(created.error)}`,
        options: opts,
      } as const satisfies ModbusRTUDriverError);
    }
    return ok(created.data);
  }

  /* ---------------------------- transport seam ---------------------------- */

  protected get client(): ModbusClientLike {
    return this.#client;
  }

  protected targetLabel() {
    const { serialPort, baudRate, parity } = this.options;
    return `${serialPort} @ ${baudRate} 8${parity[0].toUpperCase()}`;
  }

  /**
   * Modbus RTU has no session to re-establish, so a user-configurable interval
   * would be meaningless. The base reconnect loop only fires when the port is
   * genuinely gone, so a fixed backoff is enough.
   */
  protected get reconnectIntervalMs() {
    return 5000;
  }

  protected openTransport() {
    // opening a port that is already open or opening emits 'error', which would
    // escape as an unhandled event, so bail out before that can happen
    if (this.connected || this.#port.opening || this.#port.isOpen) {
      return ok(undefined);
    }
    const opened = attempt(() =>
      this.#port.open((e) => {
        // open() is asynchronous, so a failure here arrives after connect() has
        // already returned ok. Nothing else reports it: no 'error' event is
        // emitted when a callback is supplied, and no 'close' follows a failed
        // open. Without this the driver would sit forever in "connecting".
        if (e) this.onTransportDown(e.message);
      }),
    );
    if (opened.error) {
      this.setConnected(false);
      return err({
        reason: "SERIAL_PORT_OPEN_FAILED",
        cause: `opening ${this.targetLabel()} failed: ${errorToString(opened.error)}`,
        options: this.options,
      } as const satisfies ModbusRTUDriverError);
    }
    return ok(undefined);
  }

  protected closeTransport() {
    // must not be gated on `disposed`: dispose() sets that flag before it calls
    // this, and the open port is exactly what dispose() exists to release
    if (this.#port.isOpen) {
      // the callback is mandatory: without it a close error is emitted as
      // 'error' instead, and an already-closed port reports through it
      this.#port.close(() => {});
    }
    return ok(undefined);
  }
}
