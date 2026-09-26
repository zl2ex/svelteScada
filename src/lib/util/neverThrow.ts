export type NeverThrowError = {
  reason: string;
  cause: string | NeverThrowError;
};

/** Safely turn an unknown thrown value into a loggable / storable string. */
export function errorToString(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function neverThrowErrorToString(
  error: string | NeverThrowError,
): string {
  return typeof error === "object"
    ? `${error.reason} : \n${neverThrowErrorToString(error.cause)}`
    : error;
}
