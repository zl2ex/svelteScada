// Credits
// https://github.com/radzionc/radzionkit/blob/main/lib/utils/attempt.ts
// cheers man

export type Success<T> = { isOk: true; isErr: false; data: T };
export type Failure<E = unknown> = { isOk: false; isErr: true; error: E };
export type Result<T, E = unknown> = Success<T> | Failure<E>;

export function isPromise<T>(value: unknown): value is Promise<T> {
  return !!value && typeof (value as any).then === "function";
}

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
