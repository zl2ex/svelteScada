import { guard, live, LiveError, publish } from "svelte-realtime/server";

const HEARTBEAT_INTERVAL_MS = 1000;

/**
 * Guard that requires an authenticated user for live connections.
 *
 * @param ctx - The live request context.
 * @throws {LiveError} when no user is authenticated.
 */
export const _guard = guard((ctx) => {
  if (!ctx.user) throw new LiveError("UNAUTHENTICATED", "Must be logged in");
});

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Starts the shared heartbeat interval that publishes the current time.
 *
 * No-op when the timer is already running.
 */
function startHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    publish("connection-heartbeat", "set", Date.now());
  }, HEARTBEAT_INTERVAL_MS);
}

/**
 * Stops the shared heartbeat interval and clears the timer handle.
 *
 * No-op when the timer is not running.
 */
function stopHeartbeat() {
  if (!heartbeatTimer) return;
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

// stop timer when vite does a hmr update
if (import.meta.hot) {
  import.meta.hot.dispose(stopHeartbeat);
}

/**
 * Live stream of the server heartbeat timestamp.
 *
 * Publishes the current epoch time once per second and stops the timer when
 * the last subscriber leaves.
 *
 * @returns the current epoch timestamp in milliseconds.
 */
export const connectionHeartbeat = live.stream(
  "connection-heartbeat",
  async (): Promise<number> => Date.now(),
  {
    merge: "set",
    volatile: true,
    onSubscribe: startHeartbeat,
    onUnsubscribe: (_ctx, _topic, remaining) => {
      if (remaining === 0) stopHeartbeat();
    },
  },
);
