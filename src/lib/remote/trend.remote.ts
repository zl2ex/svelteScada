import { query } from "$app/server";
import z from "zod";
import { getTrendSeries } from "$lib/server/trend/trend";
import {
  neverThrowErrorToString,
  wireErr,
  wireOk,
  type NeverThrowError,
  type WireResult,
} from "$lib/util/neverThrow";
import { TREND_MAX_RANGE_MS, type TrendSeries } from "$lib/util/trend";

const z_trendHistoryArgs = z
  .object({
    tagId: z.string(),
    from: z.number(),
    to: z.number(),
  })
  .refine((args) => args.from < args.to, { message: "from must be before to" })
  .refine((args) => args.to - args.from <= TREND_MAX_RANGE_MS, {
    message: "range must not exceed 31 days",
  });

// built-in remote function validation rejects bad input via
// z_trendHistoryArgs before the handler runs. One tag per call so a selection
// can be fetched concurrently and each response stays inside one wire frame.
export const getTrendHistory = query(
  z_trendHistoryArgs,
  async (args): Promise<WireResult<TrendSeries, NeverThrowError>> => {
    const series = getTrendSeries(args.tagId, args.from, args.to);
    if (series.isErr()) {
      return wireErr({
        reason: series.error.reason,
        cause: neverThrowErrorToString(series.error),
      } as const satisfies NeverThrowError);
    }
    return wireOk(series.value);
  },
);
