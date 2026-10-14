import { guard, live, LiveError } from "svelte-realtime/server";
import { getRecentTrendPoints } from "$lib/server/trend/trend";
import type { TrendPoint } from "$lib/util/trend";

export const _guard = guard((ctx) => {
  if (!ctx.user) throw new LiveError("UNAUTHENTICATED", "Must be logged in");
});

/** Ring buffer size per tag - the in-memory cap for the live store. */
export const TREND_BUFFER_MAX = 10000;

/**
 * How many recent points the init callback reads. Each stream subscribe is
 * coalesced into one `{batch:[...]}` frame whose reply sums every selected
 * tag's init, so this must stay small: 64 tags x 200 points stays well under
 * the adapter's 1 MiB inbound cap. History supplies the visible window.
 */
export const TREND_INIT_LIMIT = 200;

// NOTE: keep the init callback as the second argument with nothing but
// whitespace before it - the svelte-realtime codegen parses the stream
// value type textually from its return annotation.
//
// merge: "latest" keeps the store value an array: the init result is the
// starting buffer and every sample published to `trend:${tagId}` is pushed
// on, trimmed to `max`. That is why this returns TrendPoint[] and not a
// WireResult - a non-array value would be discarded on the first event.
export const getTagTrend = live.stream(
  (ctx, tagId: string) => `trend:${tagId}`,
  async (ctx, tagId: string): Promise<TrendPoint[]> => {
    const recent = getRecentTrendPoints(tagId, TREND_INIT_LIMIT);
    if (recent.isErr()) {
      throw new LiveError("SERVER_ERROR", `failed to read trend buffer for ${tagId}`);
    }
    return recent.value;
  },
  { merge: "latest", max: TREND_BUFFER_MAX },
);
