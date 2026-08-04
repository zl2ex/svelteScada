export type Success<T> = { value: Awaited<T>; error?: never };
export type Failure<E extends Error = Error> = { value?: never; error: E };
export type Result<T, E extends Error = Error> = Success<T> | Failure<E>;

export function tryCatch<T, A extends unknown[], E extends Error = Error>(
  fn: (...args: A) => Promise<T>,
  ...args: A
): Promise<Result<T, E>>;
export function tryCatch<T, A extends unknown[], E extends Error = Error>(
  fn: (...args: A) => T,
  ...args: A
): Result<T, E>;
export function tryCatch<T, A extends unknown[], E extends Error = Error>(
  fn: (...args: A) => T | Promise<T>,
  ...args: A
): Result<T, E> | Promise<Result<T, E>> {
  try {
    const result = fn(...args);
    if (result instanceof Promise) {
      return result.then(
        (value) => ({ value }) as Result<T, E>,
        (error) =>
          ({
            error: error instanceof Error ? error : new Error(String(error)),
          }) as Result<T, E>,
      );
    }
    return { value: result } as Result<T, E>;
  } catch (error) {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
    } as Result<T, E>;
  }
}
