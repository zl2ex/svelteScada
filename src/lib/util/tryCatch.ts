export type Success<T> = { data: Awaited<T>; error?: never };
export type Failure<E extends Error = Error> = { data?: never; error: E };
export type Result<T, E extends Error = Error> = Success<T> | Failure<E>;

export function tryCatch<T, A extends unknown[]>(
  fn: (...args: A) => Promise<T>,
  ...args: A
): Promise<Result<T>>;
export function tryCatch<T, A extends unknown[]>(
  fn: (...args: A) => T,
  ...args: A
): Result<T>;
export function tryCatch<T, A extends unknown[]>(
  fn: (...args: A) => T | Promise<T>,
  ...args: A
): Result<T> | Promise<Result<T>> {
  try {
    const result = fn(...args);
    if (result instanceof Promise) {
      return result.then(
        (data) => ({ data }) as Result<T>,
        (error) => ({ error: error instanceof Error ? error : new Error(String(error)) }) as Result<T>,
      );
    }
    return { data: result } as Result<T>;
  } catch (error) {
    return { error: error instanceof Error ? error : new Error(String(error)) } as Result<T>;
  }
}
