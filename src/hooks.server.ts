import { redirect, type Handle, type ServerInit } from "@sveltejs/kit";
import { authenticateUser } from "$lib/server/auth/auth";
import { logger } from "$lib/server/pino/logger";
import { connectToDatabase } from "$lib/server/mongodb/db";

// for serialisiing errors
Object.defineProperty(Error.prototype, "toJSON", {
  value: function () {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,
      ...this,
    };
  },
  configurable: true,
});

export const init: ServerInit = async () => {
  logger.trace("[hooks.server.ts] init hook");
  connectToDatabase();
};

export const handle: Handle = async ({ event, resolve }) => {
  logger.trace("[hooks.server.ts] handle hook");
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
