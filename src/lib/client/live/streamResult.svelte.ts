import type { Readable, Unsubscriber } from "svelte/store";
import { RpcError, type StreamStore } from "svelte-realtime/client";

/**
 * Mirrors the `status` store on a `StreamStore`, derived from it so the union
 * cannot drift from the library.
 */
export type ConnectionStatus =
  StreamStore["status"] extends Readable<infer C> ? C : never;

/**
 * What the stream really carries once the not-yet-emitted `undefined` and the
 * codegen-only `{ error: RpcError }` variant have been removed, so a state that
 * reports a value always reports a real one.
 */
export type Payload<S> = Exclude<Exclude<S, undefined>, { error: RpcError }>;

/**
 * The three observable properties as one discriminated union, discriminated on
 * `status`. Narrowing on `status` is what proves whether `value` and `error`
 * carry anything, so neither needs a null check at every use.
 */
export type StreamState<S> =
  | { readonly status: "loading"; readonly value: null; readonly error: null }
  | { readonly status: "error"; readonly value: null; readonly error: RpcError }
  | {
      readonly status: "reconnecting";
      readonly value: Payload<S>;
      readonly error: null;
    }
  | {
      readonly status: "connected";
      readonly value: Payload<S>;
      readonly error: null;
    };

/**
 * `instanceof` is the whole test: the only other thing carrying an `error` on a
 * live value is a `WireErr`, whose error is a domain failure, never an
 * `RpcError`.
 */
function isRpcErrorPayload(value: unknown): value is { error: RpcError } {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    (value as { error: unknown }).error instanceof RpcError
  );
}

class StreamResult<S> {
  /**
   * The one signal. The fields feeding it stay plain, because `subscribe()`
   * fires its callback synchronously inside the effect below: reading runes
   * there would register them as dependencies of the effect that just wrote
   * them.
   */
  #current = $state<StreamState<S>>({
    status: "loading",
    value: null,
    error: null,
  });

  #value: Payload<S> | null = null;
  #error: RpcError | null = null;
  #connection: ConnectionStatus = "loading";

  /**
   * The factory reads the key it subscribes with, so changing that key re-runs
   * the effect, tears the old subscription down and opens a new one. The
   * effect only exists during component initialisation, so instances have to be
   * created there.
   */
  constructor(factory: () => StreamStore<S>) {
    $effect(() => {
      const store = factory();

      this.#value = null;
      this.#error = null;
      this.#connection = "loading";
      this.#current = { status: "loading", value: null, error: null };

      const subscriptions: Array<Unsubscriber | undefined> = [
        store.subscribe((value) => {
          if (isRpcErrorPayload(value)) {
            this.#onError(value.error);
            return;
          }
          this.#value = value === undefined ? null : (value as Payload<S>);
          this.#recompute();
        }),
        store.error?.subscribe((error) => {
          this.#onError(error);
          this.#recompute();
        }),
        store.status?.subscribe((status) => {
          this.#connection = status;
          this.#recompute();
        }),
      ];

      return () => {
        for (const unsubscribe of subscriptions) unsubscribe?.();
      };
    });
  }

  get status(): StreamState<S>["status"] {
    return this.#peek().status;
  }

  /** Null unless the state is `connected` or `reconnecting`. */
  get value(): Payload<S> | null {
    return this.#peek().value;
  }

  /** Null unless the state is `error`. */
  get error(): RpcError | null {
    return this.#peek().error;
  }

  #peek(): StreamState<S> {
    return this.#current;
  }

  #onError(error: RpcError | null) {
    if (error === null) {
      this.#error = null;
    } else {
      this.#error = error;
    }
    this.#recompute();
  }

  #recompute() {
    if (this.#error) {
      this.#current = { status: "error", value: null, error: this.#error };
      return;
    }
    if (this.#value === null) {
      this.#current = { status: "loading", value: null, error: null };
      return;
    }
    this.#current =
      this.#connection === "reconnecting"
        ? { status: "reconnecting", value: this.#value, error: null }
        : { status: "connected", value: this.#value, error: null };
  }
}

/**
 * The instance *is* the union, so `status` discriminates `value` and `error`:
 * after narrowing on it, neither needs a null check. `StreamResult` is the
 * implementation; the cast re-types it to the shapes it actually presents.
 */
export type UseStreamResult<S> = StreamState<S>;

export const UseStreamResult = StreamResult as unknown as {
  new <S>(factory: () => StreamStore<S>): UseStreamResult<S>;
};
