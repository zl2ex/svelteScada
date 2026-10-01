import type { StatusCode } from "node-opcua";
import type { Result } from "neverthrow";
import { logger } from "$lib/server/pino/logger";
import type { BaseTypeMap, BaseTypeStrings } from "$lib/server/tag/tag";
import type { NeverThrowError } from "$lib/util/neverThrow";

/* -------------------------------------------------------------------------- */
/*  Shared types                                                               */
/* -------------------------------------------------------------------------- */

/** Every value a driver can hand back to a tag. */
export type DriverValue = BaseTypeMap[BaseTypeStrings];

/** What a subscriber sees: the last good value (kept while bad) plus a status. */
export type Reading<T> = { value: T; status: StatusCode };

export interface DriverVariable<T> {
  /** Latest cached reading. */
  readonly reading: Reading<T>;
  /**
   * Calls `cb` immediately with the cached reading, then whenever the value or
   * status changes. Returns an unsubscribe function.
   */
  onChange(cb: (reading: Reading<T>) => void): () => void;
  /** Resolves once the device accepted the write. */
  write(value: T): Promise<Result<void, DriverWriteError>>;
  /** Drops this handle. When the last handle on an address is released it stops being polled. */
  release(): void;
}

export type SubscribeOptions = {
  /** Length in bytes. Required for `String`. */
  stringLength?: number;
};

export type DriverWriteError = NeverThrowError & {
  opcuaStatus: StatusCode;
};

export type DriverConnectError = NeverThrowError;
export type DriverDisconnectError = NeverThrowError;
export type DriverSubscribeError = NeverThrowError;

export type DriverConnectionListener = (connected: boolean) => void;

/* -------------------------------------------------------------------------- */
/*  The consumer contract                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Everything `Device` is allowed to know about a driver. Concrete drivers own
 * far more (sockets, sessions, poll timers) but none of it is reachable through
 * here, so a driver can be swapped, added or removed without `Device` changing.
 *
 * `connect`/`disconnect` are async because some transports cannot report a
 * result without awaiting - Modbus TCP just resolves immediately.
 */
export interface Driver {
  /** Discriminator stored on the device row, e.g. `"ModbusTCPDriver"`. */
  readonly driverName: string;
  readonly connected: boolean;
  /** Called once immediately with the current state, then on every change. */
  onConnectedChange(cb: DriverConnectionListener): () => void;
  connect(): Promise<Result<void, DriverConnectError>>;
  disconnect(): Promise<Result<void, DriverDisconnectError>>;
  subscribe(
    path: string,
    dataType: BaseTypeStrings,
    opts?: SubscribeOptions,
  ): Result<DriverVariable<DriverValue>, DriverSubscribeError>;
  dispose(): void;
}

/* -------------------------------------------------------------------------- */
/*  Shared implementation                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Owns everything every driver repeats: the connected flag, listener
 * bookkeeping, the deduped `setConnected` notify loop, and disposal. Subclasses
 * call `setConnected()` and never touch `isConnected` directly.
 */
export abstract class BaseDriver<O, N extends string> implements Driver {
  readonly driverName: N;
  readonly options: O;

  #isConnected = false;
  #isDisposed = false;
  #connectionListeners = new Set<DriverConnectionListener>();

  constructor(driverName: N, options: O) {
    this.driverName = driverName;
    this.options = options;
  }

  get connected(): boolean {
    return this.#isConnected;
  }

  /** True once `dispose()` has run; subclasses refuse to reconnect after it. */
  protected get disposed(): boolean {
    return this.#isDisposed;
  }

  onConnectedChange(cb: DriverConnectionListener) {
    const entry: DriverConnectionListener = (connected) => cb(connected);
    this.#connectionListeners.add(entry);
    entry(this.#isConnected);
    return () => {
      this.#connectionListeners.delete(entry);
    };
  }

  /** Flip the connection state and fan it out, ignoring no-op changes. */
  protected setConnected(next: boolean) {
    if (this.#isConnected === next) return;
    this.#isConnected = next;
    for (const cb of this.#connectionListeners) {
      try {
        cb(next);
      } catch (e) {
        logger.error(
          e,
          `[${this.driverName}] connection listener threw`,
        );
      }
    }
  }

  /** Subclasses override and call this first. */
  dispose() {
    this.#isDisposed = true;
    this.setConnected(false);
    this.#connectionListeners.clear();
    logger.trace(`[${this.driverName}] dispose()`);
  }

  [Symbol.dispose]() {
    this.dispose();
  }

  abstract connect(): Promise<Result<void, DriverConnectError>>;
  abstract disconnect(): Promise<Result<void, DriverDisconnectError>>;
  abstract subscribe(
    path: string,
    dataType: BaseTypeStrings,
    opts?: SubscribeOptions,
  ): Result<DriverVariable<DriverValue>, DriverSubscribeError>;
}