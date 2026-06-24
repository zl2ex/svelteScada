export type Success<T> = { data: Awaited<T>; error?: never };
export type Failure<E extends Error = Error> = { data?: never; error: E };
export type Result<T, E extends Error = Error> = Success<T> | Failure<E>;

export async function tryCatch<T, A extends unknown[]>(
  fn: (...args: A) => Promise<Awaited<T>> | Awaited<T>,
  ...args: A
): Promise<Result<T>> {
  try {
    const data = await Promise.resolve().then(() => fn(...args));
    return { data };
  } catch (error) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }
}
