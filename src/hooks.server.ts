import { redirect, type Handle, type ServerInit } from "@sveltejs/kit";
import { building } from "$app/environment";
import { authenticateUser } from "$lib/server/auth/auth";
import { logger } from "$lib/server/pino/logger";
import { DeviceManager } from "$lib/server/drivers/driver";
import { UdtManager } from "$lib/server/tag/udtManager";
import { TagManager } from "$lib/server/tag/tagManager";
import { FolderManager } from "$lib/server/tag/folderManager";
import { OpcuaServerDriver } from "$lib/server/drivers/opcua/opcuaServer";
import { neverThrowErrorToString } from "$lib/util/neverThrow";
import { defineAbilityFor } from "$lib/permissions/ability";
import { userThemeManager } from "$lib/server/theme/userThemeManager";

const REMOTE_PATH_PREFIX = "/_app/remote/";

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
    throw Error(`[hooks.server.ts] init() failed to start gatewayOpcua: ${started.error.cause}`);
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
    throw Error(`[hooks.server.ts] init() failed to load devices: ${devices.error.cause}`);
  }

  const udts = await udtManager.loadAllFromDb();
  if (udts.isErr()) {
    throw Error(`[hooks.server.ts] init() failed to load udts: ${udts.error.cause}`);
  }

  const folders = folderManager.loadAllFromDb();
  if (folders.isErr()) {
    throw Error(`[hooks.server.ts] init() failed to load folders: ${folders.error.cause}`);
  }

  const tags = await tagManager.loadAllFromDb();
  if (tags.isErr()) {
    throw Error(`[hooks.server.ts] init() failed to load tags: ${tags.error.cause}`);
  }

  const defaultTheme = userThemeManager.ensureDefault();
  if (defaultTheme.isErr()) {
    throw Error(
      `[hooks.server.ts] init() failed to ensure default theme: ${neverThrowErrorToString(defaultTheme.error)}`,
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
    event.locals.ability = defineAbilityFor(null);
  } else {
    event.locals.user = authenticated.value;
    event.locals.ability = defineAbilityFor(authenticated.value);
  }

  // SvelteKit rewrites event.url back to the page that made the remote call,
  // so use the raw request URL to detect a remote function request.
  const requestPathname = new URL(event.request.url).pathname;
  const isRemoteRequest = requestPathname.startsWith(REMOTE_PATH_PREFIX);

  // Prerender remote functions run during the build without a session.
  if (building && isRemoteRequest) {
    return await resolve(event);
  }

  // only the login page is unprotected unless logged in
  if (event.locals.user || event.url.pathname.startsWith("/login")) {
    return await resolve(event);
  }

  if (isRemoteRequest) {
    return new Response(
      JSON.stringify({
        type: "error",
        status: 401,
        error: "UNAUTHENTICATED",
      }),
      {
        status: 401,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      },
    );
  }

  const loginUrl = new URL("/login", event.url);
  loginUrl.searchParams.set("redirect", event.url.pathname + event.url.search);
  redirect(303, loginUrl.pathname + loginUrl.search);
};
