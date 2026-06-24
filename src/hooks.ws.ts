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
import { authenticateUser } from "$lib/server/auth/auth";
import { logger } from "$lib/server/pino/logger";
import { message } from "svelte-realtime/server";
export { message };

export function upgrade({ cookies }) {
  logger.trace("hooks.ws.ts");
  if (!cookies.token) return false;
  let user = authenticateUser(cookies.token);
  return user;
}
