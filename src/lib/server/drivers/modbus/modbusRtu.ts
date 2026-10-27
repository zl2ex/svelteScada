import Modbus from "jsmodbus";
import { err, ok } from "neverthrow";
import { SerialPort } from "serialport";
import { logger } from "$lib/server/pino/logger";
import {
  z_DeviceModbusRtuOptionsInsert,
  type DeviceModbusRtuOptionsConfig,
  type DeviceModbusRtuOptionsInsert,
} from "$lib/sqlite/tables";
import { attempt } from "$lib/util/attempt";
import { errorToString } from "$lib/util/neverThrow";
import { BaseModbusDriver, type ModbusClientLike, type ModbusDriverError } from "./modbusBase";

/* -------------------------------------------------------------------------- */
/*  Driver                                                                    */
/* -------------------------------------------------------------------------- */

export type ModbusRTUDriverError = ModbusDriverError<DeviceModbusRtuOptionsInsert>;

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
  DeviceModbusRtuOptionsConfig,
  "ModbusRTUDriver"
> {
  #port: SerialPort;
  #client: ModbusClientLike;

  private constructor(config: DeviceModbusRtuOptionsConfig) {
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

  static create(opts: DeviceModbusRtuOptionsInsert) {
    const parsed = z_DeviceModbusRtuOptionsInsert.safeParse(opts);
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
    const created = attempt(() => new ModbusRTUDriver(parsed.data as DeviceModbusRtuOptionsConfig));
    if (created.isErr) {
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
    if (opened.isErr) {
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
