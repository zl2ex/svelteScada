import { redirect, type Handle, type ServerInit } from "@sveltejs/kit";
import { authenticateUser } from "$lib/server/auth/auth";
import { logger } from "$lib/server/pino/logger";
import { DeviceManager } from "$lib/server/drivers/driver";
import { UdtManager } from "$lib/server/tag/udtManager";
import { TagManager } from "$lib/server/tag/tagManager";
import { FolderManager } from "$lib/server/tag/folderManager";
import { OpcuaServerDriver } from "$lib/server/drivers/opcua/opcuaServer";
import { building } from "$app/environment";

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
export const folderManager = new FolderManager();
export const tagManager = new TagManager();
export const gatewayOpcua: OpcuaServerDriver =
  (globalThis as any).__gatewayOpcua ??
  ((globalThis as any).__gatewayOpcua = new OpcuaServerDriver());

export const init: ServerInit = async () => {
  logger.debug("[hooks.server.ts] init() hook");

  await gatewayOpcua.start();

  if (!gatewayOpcua.server) {
    throw Error(`[hooks.server.ts] init() gatewayOpcua.server not initalised`);
  }

  deviceManager.initOpcuaServer(gatewayOpcua.server);
  tagManager.initOpcuaServer(gatewayOpcua.server, folderManager);
  folderManager.initOpcuaServer(
    gatewayOpcua.server,
    gatewayOpcua.server.engine.addressSpace?.rootFolder,
  );

  await deviceManager.loadAllFromDb();
  udtManager.loadAllFromDb();
  folderManager.loadAllFromDb();
  tagManager.loadAllFromDb();
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
