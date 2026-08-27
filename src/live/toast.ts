import { guard, live, LiveError, publish } from "svelte-realtime/server";

export type ToastKind = "info" | "success" | "warning" | "error";

export type ToastMessage = {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  duration?: number;
};

export const _guard = guard((ctx) => {
  if (!ctx.user) throw new LiveError("UNAUTHENTICATED", "Must be logged in");
});

// Server pushes toasts by publishing a `set` event on this topic.
// Volatile: fire-and-forget, never replayed on reconnect.
export const toastPush = live.stream("toast-push", async () => null, {
  merge: "set",
  volatile: true,
});

// Call from any server code (drivers, managers, live handlers) to notify
// all connected clients.
export function pushToast(message: Omit<ToastMessage, "id">) {
  publish("toast-push", "set", { ...message, id: newId() });
}

function newId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}
