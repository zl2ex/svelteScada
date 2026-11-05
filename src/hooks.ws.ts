// SECURITY: this scaffolded upgrade() hook accepts every WebSocket
// connection and gives it a random UUID identity. It exists so the
// scaffold works out of the box. Before deploying anything that
// touches a real session store, real users, or anything else worth
// protecting, replace this hook with one of:
//
//   1. Cookie session - parse req.getHeader('cookie'), look up the
//      session id in your store, return { id: session.userId } or
//      false if missing/expired.
//
//   2. Bearer token - parse req.getHeader('authorization'), validate
//      the JWT or opaque token, return { id: claims.sub } or false.
//
//   3. Signed query token - parse the upgrade URL's query string,
//      verify a server-issued HMAC, return { id: claims.userId } or
//      false. Useful when the client cannot send custom headers.
//
// Returning false from upgrade() rejects the connection. The object
// you return becomes ctx.user on every message and live() call.
//
// Delete the SCAFFOLD_PLACEHOLDER line below to silence the runtime
// warning once your auth is in place.
import type { CloseContext, OpenContext, UpgradeContext, WebSocket } from "svelte-adapter-uws";
import { authenticateUser } from "$lib/server/auth/auth";
import type { SessionUser } from "$lib/permissions/ability";
import { logger } from "$lib/server/pino/logger";
import { attempt } from "$lib/util/attempt";
import { realtime } from "svelte-realtime/server";

const hooks = realtime();
export const message = hooks.message;
export const init = hooks.init;

const MAX_TIMEOUT_MS = 2_147_483_647;
const expiryTimers = new WeakMap<object, ReturnType<typeof setTimeout>>();

function closeExpiredSocket(ws: WebSocket<SessionUser>) {
  const closed = attempt(() => ws.end(4401, "Session expired"));
  if (closed.isErr) logger.error(closed.error);
}

function scheduleExpiry(ws: WebSocket<SessionUser>, tokenExpiresAt: number) {
  const remaining = tokenExpiresAt - Date.now();
  if (remaining <= 0) {
    expiryTimers.delete(ws);
    closeExpiredSocket(ws);
    return;
  }

  const timer = setTimeout(
    () => scheduleExpiry(ws, tokenExpiresAt),
    Math.min(remaining, MAX_TIMEOUT_MS),
  );
  expiryTimers.set(ws, timer);
}

export function open(ws: WebSocket<SessionUser>, ctx: OpenContext) {
  hooks.open(ws, ctx);

  const tokenExpiresAt = ws.getUserData()?.tokenExpiresAt;
  if (typeof tokenExpiresAt === "number") scheduleExpiry(ws, tokenExpiresAt);
}

export function close(ws: WebSocket<SessionUser>, ctx: CloseContext) {
  const timer = expiryTimers.get(ws);
  if (timer) clearTimeout(timer);
  expiryTimers.delete(ws);

  hooks.close(ws, ctx);
}

export async function upgrade({ cookies }: UpgradeContext) {
  logger.trace("hooks.ws.ts");
  if (!cookies.token) return false;
  const user = await authenticateUser(cookies.token);
  if (user.isErr()) {
    logger.error(user.error);
    return false;
  }
  return user.value;
}
