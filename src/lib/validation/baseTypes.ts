import z from "zod";

// Base schemas for primitives
export const z_BaseTypes = {
  Boolean: z.boolean().default(false),
  String: z.string().default(""),
  UInt16: z.number().int().min(0).max(65535).default(0),
  Int16: z.number().int().min(-32768).max(32767).default(0),
  UInt32: z.number().int().min(0).max(4294967295).default(0),
  Int32: z.number().int().min(-2147483648).max(2147483647).default(0),
  UInt64: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
  Int64: z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER).default(0),
  Float: z.number().min(-3.4028234663852886e38).max(3.4028234663852886e38).default(0),
  Double: z.number().min(-Number.MAX_VALUE).max(Number.MAX_VALUE).default(0),
} as const;

// runtime array of keys, typed as a tuple of literal strings
export const baseTypeKeys = Object.keys(z_BaseTypes) as [keyof typeof z_BaseTypes];
