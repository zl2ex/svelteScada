import { redirect, error, type Handle, type ServerInit } from "@sveltejs/kit";
import { authenticateUser } from "$lib/server/auth/auth";
import { logger } from "$lib/pino/logger";
import { connectToDatabase } from "$lib/server/mongodb/db";

export const init: ServerInit = async () => {
  logger.debug("[hooks.server.ts] init hook");
  connectToDatabase();
};

export const handle: Handle = async ({ event, resolve }) => {
  logger.debug("[hooks.server.ts] handle hook");
  event.locals.user = await authenticateUser(event);

  // only the login page is unprotected unless logged in
  if (
    event.locals.user ||
    event.url.pathname.startsWith("/login") ||
    event.url.pathname.startsWith("/register")
  ) {
    return await resolve(event);
  } else {
    redirect(303, `/login?redirect=${event.url.pathname}`);
  }
};
