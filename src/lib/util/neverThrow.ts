export type NeverThrowError = {
  reason: string;
  cause: string | NeverThrowError;
};

/**
 * Safely turn an unknown thrown value into a loggable / storable string.
 *
 * @param error - The thrown value to convert
 * @returns The error message when it is an Error, otherwise the String form
 */
export function errorToString(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Recursively flattens a NeverThrowError (or string) into a human-readable string.
 *
 * @param error - The error string or NeverThrowError to flatten
 * @returns The reason followed by its recursively flattened cause
 */
export function neverThrowErrorToString(
  error: string | NeverThrowError,
): string {
  return typeof error === "object"
    ? `${error.reason} : \n${neverThrowErrorToString(error.cause)}`
    : error;
}

export type WireErr<E> = {
  isErr: true;
  isOk: false;
  error: E;
};

export type WireOk<T> = {
  isErr: false;
  isOk: true;
  value: T;
};

export type WireResult<T, E> = WireErr<E> | WireOk<T>;

/**
 * Creates a failed wire result for transport over the network.
 *
 * @param error - The error payload to include
 * @returns A WireResult marked as an error carrying the given payload
 */
export function wireErr<E>(error: E): WireResult<never, E> {
  return {
    isErr: true,
    isOk: false,
    error,
  };
}

/**
 * Creates a successful wire result for transport over the network.
 *
 * @param value - The value to include
 * @returns A WireResult marked as successful carrying the given value
 */
export function wireOk<T>(value: T): WireResult<T, never> {
  return {
    isErr: false,
    isOk: true,
    value,
  };
}

/**
 * Checks whether an unknown value has the shape of a WireResult.
 *
 * @param result - Value to inspect
 * @returns True when the value contains both `isErr` and `isOk` keys
 */
export function isWireResult<T, E>(
  result: unknown,
): result is WireResult<T, E> {
  return "isErr" in result && "isOk" in result;
}

/**
 * Checks whether an unknown value is a failed WireResult.
 *
 * @param result - Value to inspect
 * @returns True when the value has `isErr === true` and `isOk === false`
 */
export function isWireErr<E>(result: unknown): result is WireErr<E> {
  return (
    "isErr" in result &&
    "isOk" in result &&
    result.isErr === true &&
    result.isOk === false
  );
}

/**
 * Checks whether an unknown value is a successful WireResult.
 *
 * @param result - Value to inspect
 * @returns True when the value has `isErr === false` and `isOk === true`
 */
export function isWireOk<T>(result: unknown): result is WireOk<T> {
  return (
    "isErr" in result &&
    "isOk" in result &&
    result.isErr === false &&
    result.isOk === true
  );
}
