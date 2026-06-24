import { redirect, type Handle, type ServerInit } from "@sveltejs/kit";
import { authenticateUser } from "$lib/server/auth/auth";
import { logger } from "$lib/server/pino/logger";
import { connectToDatabase } from "$lib/server/mongodb/db";
import { DeviceManager } from "$lib/server/drivers/driver";
import { UdtManager } from "$lib/server/tag/udtManager";
import { TagManager } from "$lib/server/tag/tagManager";
import { building, dev } from "$app/environment";
import { OpcuaServerDriver } from "$lib/server/drivers/opcua/opcuaServer";

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

export const deviceManager = new DeviceManager();
export const udtManager = new UdtManager();
export const tagManager = new TagManager();
export const gatewayOpcua = new OpcuaServerDriver();

export const init: ServerInit = async () => {
  logger.trace("[hooks.server.ts] init hook");

  if (building) return;
  if (!gatewayOpcua.server) return;
  await gatewayOpcua.start();

  deviceManager.initOpcuaServer(gatewayOpcua.server);
  tagManager.initOpcuaServer(gatewayOpcua.server);

  connectToDatabase();

  await deviceManager.loadAllFromDb();
  await udtManager.loadAllFromDb();
  await tagManager.loadAllFromDb();

  if (dev) {
    import.meta.hot?.dispose(async () => {
      await gatewayOpcua.stop();
    });
  }
};

export const handle: Handle = async ({ event, resolve }) => {
  logger.trace("[hooks.server.ts] handle hook");
  let token = event.cookies.get("token") ?? "";
  event.locals.user = await authenticateUser(token);

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
