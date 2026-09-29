import { fa } from "zod/v4/locales";

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

export function wireErr<E>(error: E): WireResult<never, E> {
  return {
    isErr: true,
    isOk: false,
    error,
  };
}

export function wireOk<T>(value: T): WireResult<T, never> {
  return {
    isErr: false,
    isOk: true,
    value,
  };
}

export function isWireResult<T, E>(
  result: unknown,
): result is WireResult<T, E> {
  return "isErr" in result && "isOk" in result;
}

export function isWireErr<E>(result: unknown): result is WireErr<E> {
  return (
    "isErr" in result &&
    "isOk" in result &&
    result.isErr === true &&
    result.isOk === false
  );
}

export function isWireOk<T>(result: unknown): result is WireOk<T> {
  return (
    "isErr" in result &&
    "isOk" in result &&
    result.isErr === false &&
    result.isOk === true
  );
}
