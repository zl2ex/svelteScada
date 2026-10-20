import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { err, ok } from "neverthrow";
import { attempt } from "$lib/util/attempt";
import { errorToString, type NeverThrowError } from "$lib/util/neverThrow";
import {
  isGoodStatusCode,
  toTrendValue,
  TREND_MAX_POINTS,
  type TrendPoint,
  type TrendSeries,
} from "$lib/util/trend";
import { db } from "$lib/server/sqlite/db";
import { trends } from "$lib/sqlite/tables";
import { getPlatform } from "svelte-realtime";
import { logger } from "../pino/logger";

/**
 * Reads trend samples for one tag within [from, to] (epoch ms), ascending,
 * parsed into plottable points. When the range yields more than
 * TREND_MAX_POINTS samples they are averaged down to that many points so the
 * response stays small enough for a single wire frame. A tag with no samples
 * in the range comes back with an empty points array.
 */
export function getTrendSeries(tagId: string, from: number, to: number) {
  const rows = attempt(() =>
    db
      .select()
      .from(trends)
      .where(and(eq(trends.tagId, tagId), gte(trends.timestamp, from), lte(trends.timestamp, to)))
      .orderBy(asc(trends.timestamp))
      .all(),
  );
  if (rows.error) {
    return err({
      reason: "TREND_QUERY_FAILED",
      cause: errorToString(rows.error),
    } as const satisfies NeverThrowError);
  }

  const points: TrendPoint[] = [];
  for (const row of rows.data) {
    const parsed = attempt(() => JSON.parse(row.value) as unknown);
    if (parsed.error) continue;
    const value = toTrendValue(parsed.data);
    if (value === null) continue;
    points.push({ timestamp: row.timestamp, value, statusCode: row.statusCode });
  }

  const reduced = reduceTrendPoints(points);
  return ok({ tagId, points: reduced.points, factor: reduced.factor } satisfies TrendSeries);
}

/**
 * Averages a series down to TREND_MAX_POINTS when it is longer. Consecutive
 * samples are grouped (`factor = ceil(n / TREND_MAX_POINTS)`); each group
 * becomes one point with the group's mean timestamp and value. If any sample
 * in the group is not Good the averaged point carries that bad status code,
 * so outage dimming still shows on downsampled ranges. The returned `factor`
 * is 1 when the samples are untouched.
 */
function reduceTrendPoints(points: TrendPoint[]): { points: TrendPoint[]; factor: number } {
  if (points.length <= TREND_MAX_POINTS) return { points, factor: 1 };
  logger.trace(`reduceTrendPoints() reducing from ${points.length} to ${TREND_MAX_POINTS}`);

  const factor = Math.ceil(points.length / TREND_MAX_POINTS);
  const reduced: TrendPoint[] = [];
  for (let i = 0; i < points.length; i += factor) {
    const end = Math.min(i + factor, points.length);
    let valueSum = 0;
    let timeSum = 0;
    let badStatusCode: number | undefined;
    for (let j = i; j < end; j++) {
      const point = points[j];
      valueSum += point.value;
      timeSum += point.timestamp;
      if (badStatusCode === undefined && !isGoodStatusCode(point.statusCode)) {
        badStatusCode = point.statusCode;
      }
    }
    const count = end - i;
    reduced.push({
      timestamp: Math.round(timeSum / count),
      value: valueSum / count,
      statusCode: badStatusCode ?? points[i].statusCode,
    });
  }
  return { points: reduced, factor };
}

/**
 * The most recent `limit` samples for one tag, oldest first - the initial
 * buffer for the live `getTagTrend` stream.
 */
export function getRecentTrendPoints(tagId: string, limit: number) {
  const rows = attempt(() =>
    db
      .select()
      .from(trends)
      .where(eq(trends.tagId, tagId))
      .orderBy(desc(trends.timestamp))
      .limit(limit)
      .all(),
  );
  if (rows.error) {
    return err({
      reason: "TREND_QUERY_FAILED",
      cause: errorToString(rows.error),
    } as const satisfies NeverThrowError);
  }

  const points: TrendPoint[] = [];
  for (const row of rows.data) {
    const parsed = attempt(() => JSON.parse(row.value) as unknown);
    if (parsed.error) continue;
    const value = toTrendValue(parsed.data);
    if (value === null) continue;
    points.push({ timestamp: row.timestamp, value, statusCode: row.statusCode });
  }
  points.reverse();
  return ok(points);
}

export function publishTrend(id: string, point: TrendPoint) {
  // stream the sample to any live getTagTrend(${this.id}) subscribers

  const platform = getPlatform();
  if (!platform) {
    logger.debug(
      `[publishTrend()] publish trend:${id} skipped, realtime platform not captured yet`,
    );
    return;
  }
  platform.publish(`trend:${id}`, "push", point);
}
