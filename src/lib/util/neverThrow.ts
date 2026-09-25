export type NeverThrowError = {
  reason: string;
  cause: string | NeverThrowError;
};

export function neverThrowErrorToString(
  error: string | NeverThrowError,
): string {
  return typeof error === "object"
    ? `${error.reason} \n : ${neverThrowErrorToString(error.cause)}`
    : error;
}
