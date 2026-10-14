/**
 * Shared trend types + helpers. Lives in $lib so server code, the live
 * codegen (which parses stream return annotations and emits `import type`
 * lines) and client components can all use it.
 */

export type TrendPoint = {
  timestamp: number;
  value: number;
  statusCode: number;
};

export type TrendSeries = {
  tagId: string;
  points: TrendPoint[];
  /** 1 = raw samples; >1 = averaged down by this factor. */
  factor: number;
};

/** Chart.js-facing point: {x: timestamp, y: value} plus the sample status. */
export type TrendChartPoint = {
  x: number;
  y: number;
  statusCode: number;
};

/** Chart.js-facing series shape. */
export type TrendChartSeries = {
  label: string;
  color: string;
  data: TrendChartPoint[];
};

/** True when the OPC-UA status severity bits are Good (top two bits 00). */
export function isGoodStatusCode(statusCode: number): boolean {
  return (statusCode & 0xc0000000) === 0;
}

/** True when the OPC-UA status severity bits are Bad (top two bits 10). */
export function isBadStatusCode(statusCode: number): boolean {
  return (statusCode >>> 30) === 2;
}

/**
 * "Name (0x00000000)" for a numeric OPC-UA status code, resolved through the
 * prerendered status map. Falls back to the base code name (masking the info
 * bits) and finally to the bare hex value when the code is unknown.
 */
export function formatStatusCode(statusCode: number, names: Record<number, string>): string {
  const hex = `0x${(statusCode >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
  const name = names[statusCode] ?? names[(statusCode & 0xffff0000) >>> 0];
  return name ? `${name} (${hex})` : hex;
}

/** Apply an alpha to a #rrggbb colour, returning an rgba() string. */
export function withAlpha(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return hex;
  const value = parseInt(match[1], 16);
  return `rgba(${(value >> 16) & 0xff}, ${(value >> 8) & 0xff}, ${value & 0xff}, ${alpha})`;
}

/** Longest history range the trend remote function accepts. */
export const TREND_MAX_RANGE_MS = 31 * 24 * 60 * 60 * 1000;

/**
 * Most points a single tag's history response may carry. A tag with more
 * samples in the requested range is averaged down to this many points so the
 * per-tag response frame stays well under the adapter's 1 MiB inbound cap.
 */
export const TREND_MAX_POINTS = 5000;

/**
 * Coerce a raw tag value to a plottable number, or null when it cannot be
 * plotted (strings, non-finite numbers). Booleans plot as 0/1 states.
 */
export function toTrendValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return null;
}
