/*import http from 'http';
import express from 'express';
import { server } from './socketIoHandler';
import { handler } from '../build/handler';


const app = express();
const httpServer = http.createServer(app);

// Inject SocketIO
server.injectSocketIO(httpServer);

// SvelteKit handlers
app.use(handler);

httpServer.listen(3000, () => {
    console.log('Running on http://localhost:3000');
});

*/

import express from "express";
import { createServer, Server } from "http";
import { handler } from "../../build/handler";
import { creatSocketIoServer } from "../lib/server/socket.io/socket.io";
import {
  createOPCUAServer,
  startOPCUAClient,
} from "../lib/server/drivers/opcua/opcuaServer";
import { Tag } from "../lib/server/tag/tag";
import { logger } from "../lib/pino/logger";
import { DeviceManager, Device } from "../lib/server/drivers/driver";

const app = express();
const httpServer = createServer(app);

// SvelteKit handlers
app.use(handler);

export const deviceManager = new DeviceManager();

export async function main(httpServer: Server) {
  creatSocketIoServer(httpServer);
  Tag.opcuaServer = await createOPCUAServer();

  let plc1 = new Device(Tag.opcuaServer, {
    name: "plc1",
    driverName: "ModbusTCPDriver",
    options: {
      ip: "127.0.0.1",
    },
  });

  deviceManager.addDevice(plc1);

  const testTag = new Tag("Double", {
    name: "testTag",
    path: "/testTag",
    nodeId: "ns=1;s=/[plc1]/fhr200",
    initialValue: 10.1,
  });

  await Tag.loadAllTagsFromDB();
  startOPCUAClient();

  //httpServer.listen(3000);
  poll();
}

//main(httpServer);

function poll() {
  logger.debug(Tag.tags["/demo/test"]?.value);
  Tag.tags["/demo/test"]?.update(Tag.tags["/demo/test"]?.value + 1);
  Tag.tags["/testTag"].update(Tag.tags["/testTag"].value + 1);
  setTimeout(poll, 1000);
}
