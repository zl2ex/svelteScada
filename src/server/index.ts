import express from "express";
import { createServer, Server } from "http";
import { handler } from "../../build/handler";
import { creatSocketIoServer } from "../lib/server/socket.io/socket.io";
import {
  createOPCUAServer,
  startOPCUAClient,
} from "../lib/server/drivers/opcua/opcuaServer";
import { logger } from "../lib/server/pino/logger";
import { DeviceManager } from "../lib/server/drivers/driver";
import { TagManager } from "../lib/server/tag/tagManager";

const app = express();
const httpServer = createServer(app);

// SvelteKit handlers
app.use(handler);

// global this to work with sveltekit in dev mode
export const deviceManager: DeviceManager =
  globalThis.__deviceManager ?? new DeviceManager();
if (!globalThis.__deviceManager) globalThis.__deviceManager = deviceManager;

// global this to work with sveltekit in dev mode
export const tagManager: TagManager =
  globalThis.__tagManager ?? new TagManager();
if (!globalThis.__tagManager) globalThis.__tagManager = tagManager;

export async function main(httpServer: Server) {
  creatSocketIoServer(httpServer);
  const opcuaServer = await createOPCUAServer();
  //Tag.initOpcuaServer(opcuaServer); // TD WIP move to tag manager
  deviceManager.initOpcuaServer(opcuaServer);
  tagManager.initOpcuaServer(opcuaServer);

  await deviceManager.loadAllFromDb();

  await tagManager.loadFromDb();

  startOPCUAClient();
}

const mode = "dev";
if (mode === "prod") {
  httpServer.listen(3000);
  main(httpServer);
  //app.listen(3000);
}

function poll() {
  setTimeout(poll, 1000);
}
