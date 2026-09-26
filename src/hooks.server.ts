import { redirect, type Handle, type ServerInit } from "@sveltejs/kit";
import { authenticateUser } from "$lib/server/auth/auth";
import { logger } from "$lib/server/pino/logger";
import { DeviceManager } from "$lib/server/drivers/driver";
import { UdtManager } from "$lib/server/tag/udtManager";
import { TagManager } from "$lib/server/tag/tagManager";
import { FolderManager } from "$lib/server/tag/folderManager";
import { OpcuaServerDriver } from "$lib/server/drivers/opcua/opcuaServer";
import { neverThrowErrorToString } from "$lib/util/neverThrow";

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

  const started = await gatewayOpcua.start();
  if (started.isErr()) {
    throw Error(
      `[hooks.server.ts] init() failed to start gatewayOpcua: ${started.error.cause}`,
    );
  }

  if (!gatewayOpcua.server || !gatewayOpcua.server.engine.addressSpace) {
    throw Error(`[hooks.server.ts] init() gatewayOpcua.server not initalised`);
  }

  tagManager.initOpcuaServer(gatewayOpcua.server, folderManager);
  folderManager.initOpcuaServer(
    gatewayOpcua.server,
    gatewayOpcua.server.engine.addressSpace?.rootFolder,
  );

  const devices = await deviceManager.loadAllFromDb();
  if (devices.isErr()) {
    throw Error(
      `[hooks.server.ts] init() failed to load devices: ${devices.error.cause}`,
    );
  }

  const udts = await udtManager.loadAllFromDb();
  if (udts.isErr()) {
    throw Error(
      `[hooks.server.ts] init() failed to load udts: ${udts.error.cause}`,
    );
  }

  const folders = folderManager.loadAllFromDb();
  if (folders.isErr()) {
    throw Error(
      `[hooks.server.ts] init() failed to load folders: ${folders.error.cause}`,
    );
  }

  const tags = tagManager.loadAllFromDb();
  if (tags.isErr()) {
    throw Error(
      `[hooks.server.ts] init() failed to load tags: ${tags.error.cause}`,
    );
  }
};

export const handle: Handle = async ({ event, resolve }) => {
  logger.trace("[hooks.server.ts] handle hook");
  let token = event.cookies.get("token") ?? "";
  const authenticated = await authenticateUser(token);
  if (authenticated.isErr()) {
    logger.error(
      `[hooks.server.ts] handle hook unauthenticated: ${neverThrowErrorToString(authenticated.error)}`,
    );
    event.locals.user = undefined;
  } else {
    event.locals.user = authenticated.value;
  }

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
