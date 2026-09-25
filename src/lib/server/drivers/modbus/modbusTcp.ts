import net from "net";
import Modbus, { ModbusTCPClient } from "jsmodbus";
import { StatusCodes, type StatusCode } from "node-opcua";
import { err, errAsync, ok, ResultAsync, type Result } from "neverthrow";
import { z } from "zod";
import { logger } from "../../pino/logger";
import {
  z_insertDeviceModbusTcpOptions,
  type DeviceModbusTcpOptionsSelect,
} from "$lib/server/sqlite/tables";
import type { NeverThrowError } from "$lib/util/neverThrow";
import type { BaseTypeMap } from "$lib/server/tag/tag";
import type { DriverVariable, Reading, SubscribeOptions } from "../driver";

/* -------------------------------------------------------------------------- */
/*  Public types                                                              */
/* -------------------------------------------------------------------------- */

export type ModbusRegisterType = "hr" | "ir" | "co" | "di";

export type ModbusDataType = keyof BaseTypeMap;
type ModbusValue = BaseTypeMap[ModbusDataType];

export const Z_Endian = z.literal(["BigEndian", "LittleEndian"]);
export type Endian = z.infer<typeof Z_Endian>;

export type ModbusTCPDriverOptions = z.input<
  typeof z_insertDeviceModbusTcpOptions
>;
export type ModbusTCPDriverError = NeverThrowError & {
  options: ModbusTCPDriverOptions;
};
export type ModbusTCPWriteError = ModbusTCPDriverError & {
  opcuaStatus: StatusCode;
};

/**
 * Address format: `[(flags)]<type><address>[.<bit>]`
 *   flags: `le` | `be` | `sw` separated by `|`
 *   type:  `hr` | `ir` | `co` | `di`
 *   e.g.   `hr100`, `(le|sw)hr100`, `hr100.3`, `co12`
 */
export type ModbusSubscriptionInfo = {
  key: string;
  registerType: ModbusRegisterType;
  address: number;
  dataType: ModbusDataType;
  registerLength: number;
  refs: number;
  reading: Reading<ModbusValue>;
};

/* -------------------------------------------------------------------------- */
/*  Codecs                                                                    */
/* -------------------------------------------------------------------------- */

type CodecContext = {
  /** View over exactly this variable's registers, starting at offset 0. */
  view: DataView;
  littleEndian: boolean;
  bit?: number;
  length?: number;
};

interface TypeHandler<T> {
  /** size in bytes, undefined when variable length */
  size: number | undefined;
  default: T;
  decode(ctx: CodecContext): T;
  encode(ctx: CodecContext, value: T): void;
}

export const typeHandlers: {
  [K in ModbusDataType]: TypeHandler<BaseTypeMap[K]>;
} = {
  Boolean: {
    size: 2,
    default: false,
    decode: ({ view, bit }) => {
      const data = view.getUint16(0);
      return bit === undefined ? data !== 0 : (data & (1 << bit)) !== 0;
    },
    // for bit writes the view must already hold the current register value
    encode: ({ view, bit }, value) => {
      if (bit === undefined) return view.setUint16(0, value ? 1 : 0);
      const data = view.getUint16(0);
      view.setUint16(0, value ? data | (1 << bit) : data & ~(1 << bit));
    },
  },
  Int16: {
    size: 2,
    default: 0,
    decode: ({ view, littleEndian }) => view.getInt16(0, littleEndian),
    encode: ({ view, littleEndian }, v) => view.setInt16(0, v, littleEndian),
  },
  UInt16: {
    size: 2,
    default: 0,
    decode: ({ view, littleEndian }) => view.getUint16(0, littleEndian),
    encode: ({ view, littleEndian }, v) => view.setUint16(0, v, littleEndian),
  },
  Int32: {
    size: 4,
    default: 0,
    decode: ({ view, littleEndian }) => view.getInt32(0, littleEndian),
    encode: ({ view, littleEndian }, v) => view.setInt32(0, v, littleEndian),
  },
  UInt32: {
    size: 4,
    default: 0,
    decode: ({ view, littleEndian }) => view.getUint32(0, littleEndian),
    encode: ({ view, littleEndian }, v) => view.setUint32(0, v, littleEndian),
  },
  Int64: {
    size: 8,
    default: 0,
    decode: ({ view, littleEndian }) => {
      const hi = littleEndian
        ? view.getInt32(4, true)
        : view.getInt32(0, false);
      const lo = littleEndian
        ? view.getInt32(0, true)
        : view.getInt32(4, false);
      return hi * 4294967296 + (lo >>> 0);
    },
    encode: ({ view, littleEndian }, v) => {
      const hi = Math.floor(v / 4294967296);
      const lo = v - hi * 4294967296;
      if (littleEndian) {
        view.setUint32(0, lo >>> 0, true);
        view.setInt32(4, hi, true);
      } else {
        view.setInt32(0, hi, false);
        view.setUint32(4, lo >>> 0, false);
      }
    },
  },
  UInt64: {
    size: 8,
    default: 0,
    decode: ({ view, littleEndian }) => {
      const hi = littleEndian
        ? view.getUint32(4, true)
        : view.getUint32(0, false);
      const lo = littleEndian
        ? view.getUint32(0, true)
        : view.getUint32(4, false);
      return hi * 4294967296 + lo;
    },
    encode: ({ view, littleEndian }, v) => {
      const hi = Math.floor(v / 4294967296);
      const lo = v - hi * 4294967296;
      if (littleEndian) {
        view.setUint32(0, lo, true);
        view.setUint32(4, hi, true);
      } else {
        view.setUint32(0, hi, false);
        view.setUint32(4, lo, false);
      }
    },
  },
  Float: {
    size: 4,
    default: 0,
    decode: ({ view, littleEndian }) => view.getFloat32(0, littleEndian),
    encode: ({ view, littleEndian }, v) => view.setFloat32(0, v, littleEndian),
  },
  Double: {
    size: 8,
    default: 0,
    decode: ({ view, littleEndian }) => view.getFloat64(0, littleEndian),
    encode: ({ view, littleEndian }, v) => view.setFloat64(0, v, littleEndian),
  },
  String: {
    size: undefined,
    default: "",
    decode: ({ view, length }) => {
      const n = Math.min(length ?? view.byteLength, view.byteLength);
      const bytes = new Uint8Array(view.buffer, view.byteOffset, n);
      return new TextDecoder().decode(bytes).replace(/\0+$/, "");
    },
    encode: ({ view, length }, value) => {
      const n = Math.min(length ?? view.byteLength, view.byteLength);
      const target = new Uint8Array(
        view.buffer,
        view.byteOffset,
        view.byteLength,
      );
      target.fill(0);
      target.set(new TextEncoder().encode(value).subarray(0, n));
    },
  },
};

const codecFor = (dataType: ModbusDataType) =>
  typeHandlers[dataType] as TypeHandler<ModbusValue>;

/* -------------------------------------------------------------------------- */
/*  Internals                                                                 */
/* -------------------------------------------------------------------------- */

type Listener = (reading: Reading<ModbusValue>) => void;

type ParsedModbusPath = {
  registerType: ModbusRegisterType;
  address: number;
  bit: number | undefined;
  endian: Endian;
  swapWords: boolean;
};

interface Sub extends ParsedModbusPath {
  key: string;
  dataType: ModbusDataType;
  stringLength: number | undefined;
  /** registers (hr/ir) or bits (co/di) */
  registerLength: number;
  refs: number;
  last: Reading<ModbusValue>;
  listeners: Set<Listener>;
}

type Batch = {
  type: ModbusRegisterType;
  start: number;
  end: number; // exclusive
  subs: Sub[];
};

type RawRead =
  { kind: "words"; bytes: Uint8Array } | { kind: "bits"; bits: boolean[] };

type ReadFailure = {
  status: StatusCode;
  message: string;
  deviceException: boolean;
};

// expects a structure like (le|sw)hr20.1
const PATH_REGEX =
  /^(?:\((?<flags>[a-z|]+)\))?(?<registerType>hr|ir|co|di)(?<address>\d+)(?:\.(?<bit>\d+))?$/;

const MAX_REGISTERS_PER_READ = 125;
const MAX_BITS_PER_READ = 2000;

/* -------------------------------------------------------------------------- */
/*  Driver                                                                    */
/* -------------------------------------------------------------------------- */

export class ModbusTCPDriver {
  private client: ModbusTCPClient;
  private socket: net.Socket;
  private subs = new Map<string, Sub>();

  private pollTimer?: NodeJS.Timeout;
  private polling = false;
  private reconnectTimer?: NodeJS.Timeout;
  private shouldReconnect = false;
  private disposed = false;

  /** serialises every request on the socket (polls and writes) */
  private queue: Promise<unknown> = Promise.resolve();

  options: DeviceModbusTcpOptionsSelect;
  connected = false;

  private constructor(config: DeviceModbusTcpOptionsSelect) {
    this.options = config;

    this.socket = new net.Socket();
    this.client = new Modbus.client.TCP(this.socket, this.options.unitId);

    this.socket.on("connect", () => {
      if (this.connected) return;
      this.connected = true;
      logger.info(
        `[ModbusTCPDriver] Connected to Modbus device at ${this.options.ip}:${this.options.port}`,
      );
      this.startPolling();
    });
    this.socket.on("error", (e) => {
      logger.debug(`[ModbusTCPDriver] socket error: ${e.message}`);
      this.onSocketDown();
    });
    this.socket.on("close", () => this.onSocketDown());
  }

  static create(opts: ModbusTCPDriverOptions) {
    const parsed = z_insertDeviceModbusTcpOptions.safeParse(opts);
    if (!parsed.success) {
      return err({
        reason: "OPTIONS_PARSE_ERROR",
        cause: parsed.error.message,
        options: opts,
      } as const satisfies ModbusTCPDriverError);
    }
    return ok(new ModbusTCPDriver(parsed.data as DeviceModbusTcpOptionsSelect));
  }

  [Symbol.dispose]() {
    this.dispose();
  }

  dispose() {
    this.disposed = true;
    this.shouldReconnect = false;
    this.connected = false;
    this.stopPolling();
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.publishAll(StatusCodes.BadConditionDisabled);
    this.subs.clear();
    this.socket.removeAllListeners();
    this.socket.on("error", () => {}); // swallow late errors after teardown
    this.socket.destroy();
    logger.trace(`[ModbusTCPDriver] dispose()`);
  }

  /* ------------------------------ connection ------------------------------ */

  connect() {
    if (this.disposed) return;
    this.shouldReconnect = true;
    this.openSocket();
  }

  disconnect() {
    this.shouldReconnect = false;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.stopPolling();
    this.connected = false;
    this.publishAll(StatusCodes.BadConditionDisabled);
    this.socket.destroy();
    logger.info(
      `[ModbusTCPDriver] Disconnected from Modbus device at ${this.options.ip}:${this.options.port}`,
    );
  }

  private openSocket() {
    if (this.connected || this.socket.connecting) return;
    this.socket.connect(this.options.port, this.options.ip);
  }

  private onSocketDown() {
    this.stopPolling();
    this.connected = false;
    if (this.disposed || !this.shouldReconnect) return;
    this.publishAll(StatusCodes.BadNotConnected);
    this.scheduleReconnect();
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return; // already waiting to retry
    logger.warn(
      `[ModbusTCPDriver] connection to ${this.options.ip}:${this.options.port} down, retry in ${this.options.reconnectInervalMs} ms`,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (this.shouldReconnect) this.openSocket();
    }, this.options.reconnectInervalMs);
  }

  /* ------------------------------ subscribing ----------------------------- */

  getSubscriptions(): ModbusSubscriptionInfo[] {
    return [...this.subs.values()].map((s) => ({
      key: s.key,
      registerType: s.registerType,
      address: s.address,
      dataType: s.dataType,
      registerLength: s.registerLength,
      refs: s.refs,
      reading: s.last,
    }));
  }

  /**
   * Subscribe to a modbus address. Handles with the same address, data type,
   * byte/word order, bit and string length share one cached reading.
   * Different decodings of overlapping registers are merged into one read.
   */
  subscribe<D extends ModbusDataType>(
    path: string,
    dataType: D,
    opts: SubscribeOptions = {},
  ) {
    const parsed = this.parsePath(path);
    if (parsed.isErr()) return err(parsed.error);
    const p = parsed.value;

    const handler = codecFor(dataType);
    const isBitType = p.registerType === "co" || p.registerType === "di";
    let registerLength: number;

    if (dataType === "String") {
      const n = opts.stringLength;
      if (!n || n < 1) {
        return err(
          this.fail(
            "STRING_LENGTH_REQUIRED",
            `String at ${path} needs stringLength > 0`,
          ),
        );
      }
      registerLength = Math.ceil(n / 2);
    } else {
      registerLength = Math.max(1, (handler.size ?? 2) / 2);
    }

    if (isBitType) {
      if (dataType !== "Boolean" || p.bit !== undefined) {
        return err(
          this.fail(
            "SUBSCRIBE_DATATYPE_MISMATCH",
            `${dataType}${p.bit !== undefined ? " with bit" : ""} is not valid for ${p.registerType} at ${path}`,
          ),
        );
      }
      registerLength = 1;
    }

    if (p.bit !== undefined && (dataType !== "Boolean" || p.bit > 15)) {
      return err(
        this.fail(
          "SUBSCRIBE_BIT_INVALID",
          `bit ${p.bit} invalid for ${dataType} at ${path}`,
        ),
      );
    }

    if (p.address < 0 || p.address + registerLength > 65536) {
      return err(
        this.fail(
          "SUBSCRIBE_ADDRESS_OUT_OF_RANGE",
          `${path} resolves to register ${p.address}..${p.address + registerLength - 1} (startAddress ${this.options.startAddress})`,
        ),
      );
    }

    const stringLength = dataType === "String" ? opts.stringLength : undefined;
    const key = [
      p.registerType,
      p.address,
      dataType,
      p.endian,
      p.swapWords,
      p.bit ?? "",
      stringLength ?? "",
    ].join("|");

    let sub = this.subs.get(key);
    if (!sub) {
      sub = {
        ...p,
        key,
        dataType,
        stringLength,
        registerLength,
        refs: 0,
        last: {
          value: handler.default,
          status: this.connected
            ? StatusCodes.BadWaitingForInitialData
            : StatusCodes.BadNotConnected,
        },
        listeners: new Set(),
      };
      this.subs.set(key, sub);
      logger.debug(`[ModbusTCPDriver] subscribe() new subscription ${key}`);
    }
    sub.refs++;

    return ok(this.createHandle(sub) as DriverVariable<BaseTypeMap[D]>);
  }

  private createHandle(sub: Sub): DriverVariable<ModbusValue> {
    const mine = new Set<Listener>();
    let released = false;

    return {
      get reading() {
        return sub.last;
      },
      onChange: (cb) => {
        if (released) return () => {};
        const entry: Listener = (r) => cb(r); // unique per call so the same cb can be added twice
        mine.add(entry);
        sub.listeners.add(entry);
        entry(sub.last);
        return () => {
          mine.delete(entry);
          sub.listeners.delete(entry);
        };
      },
      write: (value) => {
        if (released) {
          return errAsync(
            this.writeFail(
              "WRITE_HANDLE_RELEASED",
              `handle for ${sub.key} was released`,
              StatusCodes.BadInternalError,
            ),
          );
        }
        return this.write(sub, value);
      },
      release: () => {
        if (released) return;
        released = true;
        for (const l of mine) sub.listeners.delete(l);
        mine.clear();
        sub.refs--;
        if (sub.refs <= 0 && this.subs.get(sub.key) === sub) {
          this.subs.delete(sub.key);
          logger.debug(
            `[ModbusTCPDriver] release() removed subscription ${sub.key}`,
          );
        }
      },
    };
  }

  private publish(sub: Sub, next: Reading<ModbusValue>) {
    if (
      Object.is(sub.last.value, next.value) &&
      sub.last.status.value === next.status.value
    ) {
      return;
    }
    sub.last = next;
    for (const cb of sub.listeners) {
      try {
        cb(next);
      } catch (e) {
        logger.error(e, `[ModbusTCPDriver] listener for ${sub.key} threw`);
      }
    }
  }

  /** keep the last value, change only the status */
  private publishStatus(sub: Sub, status: StatusCode) {
    this.publish(sub, { value: sub.last.value, status });
  }

  private publishAll(status: StatusCode) {
    for (const sub of this.subs.values()) this.publishStatus(sub, status);
  }

  /* -------------------------------- queueing ------------------------------- */

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.queue.then(fn);
    this.queue = p.then(
      () => {},
      () => {},
    );
    return p;
  }

  /* --------------------------------- polling ------------------------------- */

  private startPolling() {
    if (this.polling) return;
    this.polling = true;
    this.schedulePoll(0);
    logger.info(
      `[ModbusTCPDriver] Started Modbus polling at ${this.options.pollingIntervalMs} ms interval`,
    );
  }

  private stopPolling() {
    if (!this.polling) return;
    this.polling = false;
    clearTimeout(this.pollTimer);
    this.pollTimer = undefined;
    logger.info("[ModbusTCPDriver] Stopped Modbus polling");
  }

  /** chained rather than setInterval so a slow device can never stack polls */
  private schedulePoll(delay: number) {
    this.pollTimer = setTimeout(async () => {
      if (!this.polling) return;
      try {
        await this.poll();
      } catch (e) {
        logger.error(e, "[ModbusTCPDriver] poll() failed unexpectedly");
      }
      if (this.polling) this.schedulePoll(this.options.pollingIntervalMs);
    }, delay);
  }

  private async poll() {
    for (const batch of this.buildBatches()) {
      if (!this.connected) return;
      logger.trace(batch);
      await this.readBatch(batch);
    }
  }

  private buildBatches(): Batch[] {
    const byType = new Map<ModbusRegisterType, Sub[]>();
    for (const sub of this.subs.values()) {
      const list = byType.get(sub.registerType) ?? [];
      list.push(sub);
      byType.set(sub.registerType, list);
    }

    const maxGap = this.options.spanGaps ? Infinity : 0;
    const batches: Batch[] = [];

    for (const [type, list] of byType) {
      const limit =
        type === "hr" || type === "ir"
          ? MAX_REGISTERS_PER_READ
          : MAX_BITS_PER_READ;
      list.sort((a, b) => a.address - b.address);

      let cur: Batch | undefined;
      for (const sub of list) {
        const end = sub.address + sub.registerLength;
        if (
          cur &&
          sub.address <= cur.end + maxGap &&
          Math.max(cur.end, end) - cur.start <= limit
        ) {
          cur.end = Math.max(cur.end, end);
          cur.subs.push(sub);
        } else {
          cur = { type, start: sub.address, end, subs: [sub] };
          batches.push(cur);
        }
      }
    }
    return batches;
  }

  private async readBatch(batch: Batch) {
    const result = await this.readRaw(
      batch.type,
      batch.start,
      batch.end - batch.start,
    );

    if (result.isOk()) {
      logger.trace(result.value);
      for (const sub of batch.subs) this.applyRead(batch, sub, result.value);
      return;
    }

    const failure = result.error;

    // One bad address must not take down every tag in a merged block:
    // retry each variable on its own so only the offender goes bad.
    if (failure.deviceException && batch.subs.length > 1) {
      for (const sub of batch.subs) {
        if (!this.connected) return;
        await this.readBatch({
          type: batch.type,
          start: sub.address,
          end: sub.address + sub.registerLength,
          subs: [sub],
        });
      }
      return;
    }

    logger.warn(
      `[ModbusTCPDriver] read ${batch.type}${batch.start}..${batch.end - 1} failed: ${failure.message}`,
    );
    for (const sub of batch.subs) this.publishStatus(sub, failure.status);
  }

  private readRaw(type: ModbusRegisterType, start: number, length: number) {
    return ResultAsync.fromPromise(
      this.enqueue(async (): Promise<RawRead> => {
        switch (type) {
          case "hr": {
            const r = await this.client.readHoldingRegisters(start, length);
            return {
              kind: "words",
              bytes: toBytes(r.response.body.valuesAsBuffer),
            };
          }
          case "ir": {
            const r = await this.client.readInputRegisters(start, length);
            return {
              kind: "words",
              bytes: toBytes(r.response.body.valuesAsBuffer),
            };
          }
          case "co": {
            const r = await this.client.readCoils(start, length);
            return {
              kind: "bits",
              bits: Array.from(r.response.body.valuesAsArray, (v) =>
                Boolean(v),
              ),
            };
          }
          case "di": {
            const r = await this.client.readDiscreteInputs(start, length);
            return {
              kind: "bits",
              bits: Array.from(r.response.body.valuesAsArray, (v) =>
                Boolean(v),
              ),
            };
          }
        }
      }),
      classifyModbusError,
    );
  }

  private applyRead(batch: Batch, sub: Sub, raw: RawRead) {
    const offset = sub.address - batch.start;
    try {
      let value: ModbusValue;

      if (raw.kind === "bits") {
        if (offset >= raw.bits.length) throw new Error("short response");
        value = raw.bits[offset];
      } else {
        const from = offset * 2;
        const to = from + sub.registerLength * 2;
        if (to > raw.bytes.length) throw new Error("short response");
        value = decodeWords(sub, raw.bytes.slice(from, to));
      }

      logger.trace(value);

      this.publish(sub, { value, status: StatusCodes.Good });
    } catch (e) {
      logger.error(e, `[ModbusTCPDriver] decode failed for ${sub.key}`);
      this.publishStatus(sub, StatusCodes.BadDecodingError);
    }
  }

  /* --------------------------------- writing ------------------------------- */

  private async write(sub: Sub, value: ModbusValue) {
    if (sub.registerType === "ir" || sub.registerType === "di") {
      return errAsync(
        this.writeFail(
          "WRITE_NOT_SUPPORTED",
          `write not supported for modbus type ${sub.registerType}`,
          StatusCodes.BadNotWritable,
        ),
      );
    }
    if (!this.connected) {
      return errAsync(
        this.writeFail(
          "WRITE_NOT_CONNECTED",
          "device not connected",
          StatusCodes.BadNotConnected,
        ),
      );
    }

    return ResultAsync.fromPromise(
      this.enqueue(async () => {
        if (sub.registerType === "co") {
          await this.client.writeSingleCoil(sub.address, Boolean(value));
          return;
        }

        const buf = new Uint8Array(sub.registerLength * 2);
        const view = new DataView(buf.buffer);

        // bit write: read-modify-write inside the queue so nothing can interleave
        if (sub.bit !== undefined) {
          const r = await this.client.readHoldingRegisters(sub.address, 1);
          buf.set(toBytes(r.response.body.valuesAsBuffer).subarray(0, 2));
        }

        codecFor(sub.dataType).encode(
          {
            view,
            littleEndian: sub.endian === "LittleEndian",
            bit: sub.bit,
            length: sub.stringLength,
          },
          value,
        );
        if (sub.swapWords && sub.dataType !== "String") reverseWords(buf);

        if (sub.registerLength === 1) {
          await this.client.writeSingleRegister(sub.address, view.getUint16(0));
        } else {
          await this.client.writeMultipleRegisters(
            sub.address,
            Buffer.from(buf),
          );
        }
      }),
      (e) => {
        const f = classifyModbusError(e);
        logger.error(`[ModbusTCPDriver] write ${sub.key} failed: ${f.message}`);
        return this.writeFail("WRITE_FAILED", f.message, f.status);
      },
    ).map(() => {
      // reflect immediately; the next poll confirms what the device actually holds
      this.publish(sub, { value, status: StatusCodes.Good });
    });
  }

  /* --------------------------------- helpers ------------------------------- */

  private fail<R extends string>(reason: R, cause: string) {
    return {
      reason,
      cause: `[ModbusTCPDriver] ${cause}`,
      options: this.options,
    } as const satisfies ModbusTCPDriverError;
  }

  private writeFail<R extends string>(
    reason: R,
    cause: string,
    opcuaStatus: StatusCode,
  ) {
    return {
      ...this.fail(reason, cause),
      opcuaStatus,
    } satisfies ModbusTCPWriteError;
  }

  private parsePath(path: string) {
    const m = path.match(PATH_REGEX);
    if (!m?.groups) {
      return err(
        this.fail(
          "PARSE_PATH_FAILED",
          `cannot parse modbus path "${path}"   expects a structure like (le|sw)hr20.1`,
        ),
      );
    }

    let endian: Endian = this.options.endian as Endian;
    let swapWords = this.options.swapWords;

    if (m.groups.flags) {
      for (const raw of m.groups.flags.split("|")) {
        const flag = raw.trim();
        if (flag === "le") endian = "LittleEndian";
        else if (flag === "be") endian = "BigEndian";
        else if (flag === "sw") swapWords = !this.options.swapWords;
        else
          return err(
            this.fail(
              "PARSE_PATH_UNKNOWN_FLAG",
              `unknown flag "${flag}" in "${path}"`,
            ),
          );
      }
    }

    return ok({
      registerType: m.groups.registerType as ModbusRegisterType,
      address: parseInt(m.groups.address, 10) - this.options.startAddress,
      bit: m.groups.bit ? parseInt(m.groups.bit, 10) : undefined,
      endian,
      swapWords,
    });
  }
}

/* -------------------------------------------------------------------------- */
/*  Free functions                                                            */
/* -------------------------------------------------------------------------- */

/** decode one variable's registers (already sliced out of the batch response) */
function decodeWords(sub: Sub, bytes: Uint8Array): ModbusValue {
  if (sub.swapWords && sub.dataType !== "String") reverseWords(bytes);
  return codecFor(sub.dataType).decode({
    view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    littleEndian: sub.endian === "LittleEndian",
    bit: sub.bit,
    length: sub.stringLength,
  });
}

/** reverse the order of 16-bit words in place (AB CD -> CD AB) */
function reverseWords(bytes: Uint8Array) {
  const words = bytes.length >> 1;
  for (let i = 0, j = words - 1; i < j; i++, j--) {
    const hi = bytes[i * 2];
    const lo = bytes[i * 2 + 1];
    bytes[i * 2] = bytes[j * 2];
    bytes[i * 2 + 1] = bytes[j * 2 + 1];
    bytes[j * 2] = hi;
    bytes[j * 2 + 1] = lo;
  }
}

/** copy out of Node's shared 8K Buffer pool into a standalone Uint8Array */
function toBytes(buffer: Buffer): Uint8Array {
  return new Uint8Array(
    buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ),
  );
}

function classifyModbusError(e: unknown): ReadFailure {
  const x = e as
    | {
        err?: string;
        message?: string;
        response?: { body?: { code?: number } };
      }
    | undefined;
  const message = x?.message ?? (e instanceof Error ? e.message : String(e));

  switch (x?.err) {
    case "ModbusException":
      return {
        status:
          x?.response?.body?.code === 2 // illegal data address
            ? StatusCodes.BadOutOfRange
            : StatusCodes.BadDeviceFailure,
        message,
        deviceException: true,
      };
    case "Timeout":
      return {
        status: StatusCodes.BadTimeout,
        message,
        deviceException: false,
      };
    case "Offline":
      return {
        status: StatusCodes.BadNotConnected,
        message,
        deviceException: false,
      };
    default:
      return {
        status: StatusCodes.BadCommunicationError,
        message,
        deviceException: false,
      };
  }
}
