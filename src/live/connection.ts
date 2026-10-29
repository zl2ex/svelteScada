import { guard, live, LiveError, publish } from "svelte-realtime/server";

const HEARTBEAT_INTERVAL_MS = 1000;

export const _guard = guard((ctx) => {
  if (!ctx.user) throw new LiveError("UNAUTHENTICATED", "Must be logged in");
});

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function startHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    publish("connection-heartbeat", "set", Date.now());
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
  if (!heartbeatTimer) return;
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

if (import.meta.hot) {
  import.meta.hot.dispose(stopHeartbeat);
}

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
