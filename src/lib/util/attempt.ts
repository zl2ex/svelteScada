// Credits
// https://github.com/radzionc/radzionkit/blob/main/lib/utils/attempt.ts
// cheers man

export type Success<T> = { isOk: true; isErr: false; data: T };
export type Failure<E = unknown> = { isOk: false; isErr: true; error: E };
export type Result<T, E = unknown> = Success<T> | Failure<E>;

/**
 * Checks whether a value is a thenable promise.
 *
 * @param value - Value to inspect
 * @returns True when the value has a callable `then` method
 */
export function isPromise<T>(value: unknown): value is Promise<T> {
  return !!value && typeof (value as any).then === "function";
}

/**
 * Wraps a value-producing function, promise, or computation in a Result, capturing errors.
 *
 * Synchronous inputs return a Result directly; asynchronous inputs return a Promise of a Result.
 *
 * @param input - A function that may throw, or a promise that may reject
 * @returns A Result containing the data or error, or a Promise of one for async inputs
 */
export function attempt<T, E = unknown>(fn: () => Promise<T>): Promise<Result<T, E>>;
export function attempt<T, E = unknown>(fn: () => T): Result<T, E>;
export function attempt<T, E = unknown>(promise: Promise<T>): Promise<Result<T, E>>;
export function attempt<T, E = unknown>(
  input: Promise<T> | (() => T) | (() => Promise<T>),
): Result<T, E> | Promise<Result<T, E>> {
  if (typeof input === "function") {
    try {
      const result = input();
      if (isPromise<T>(result)) {
        return attempt(result);
      }
      return { isOk: true, isErr: false, data: result } as Result<T, E>;
    } catch (error) {
      return { isOk: false, isErr: true, error: error as E } as Failure<E>;
    }
  } else {
    return input.then(
      (data): Result<T, E> => ({ isOk: true, isErr: false, data }),
      (error): Result<T, E> =>
        ({ isOk: false, isErr: true, error: error as E }) as Failure<E>,
    );
  }
}

/**
 * Returns the successful value from a Result, or a fallback when the Result is an Err.
 *
 * @param result - The Result or Promise of a Result to unwrap
 * @param fallback - Value to return when the Result is an Err
 * @returns The Ok data, the fallback on Err, or a Promise of either when async
 */
export function withFallback<T, E = unknown>(result: Result<T, E>, fallback: T): T;
export function withFallback<T, E = unknown>(
  result: Promise<Result<T, E>>,
  fallback: T,
): Promise<T>;
export function withFallback<T, E = unknown>(
  result: Result<T, E> | Promise<Result<T, E>>,
  fallback: T,
): T | Promise<T> {
  if (isPromise<Result<T, E>>(result)) {
    return result.then((res): T => {
      if (res.isErr) {
        return fallback;
      }
      return res.data;
    });
  }

  if (result.isErr) {
    return fallback;
  }

  return result.data;
}
