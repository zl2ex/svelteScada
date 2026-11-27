import { guard, live, LiveError, publish } from "svelte-realtime/server";
import { newId } from "$lib/util/newId";

export type ToastKind = "info" | "success" | "warning" | "error";

export type ToastMessage = {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  duration?: number;
};

/**
 * Guard that requires an authenticated user for the toast stream.
 *
 * @param ctx - The live request context.
 * @throws {LiveError} when no user is authenticated.
 */
export const _guard = guard((ctx) => {
  if (!ctx.user) throw new LiveError("UNAUTHENTICATED", "Must be logged in");
});

/**
 * Live stream that pushes server-originated toast messages to clients.
 *
 * Volatile: fire-and-forget, never replayed on reconnect.
 *
 * @returns the initial stream value (null).
 */
// Server pushes toasts by publishing a `set` event on this topic.
// Volatile: fire-and-forget, never replayed on reconnect.
export const toastPush = live.stream("toast-push", async () => null, {
  merge: "set",
  volatile: true,
});

/**
 * Publishes a toast message to every connected client.
 *
 * @param message - Toast contents; an id is assigned automatically.
 */
// Call from any server code (drivers, managers, live handlers) to notify
// all connected clients.
export function pushToast(message: Omit<ToastMessage, "id">) {
  publish("toast-push", "set", { ...message, id: newId() });
}
