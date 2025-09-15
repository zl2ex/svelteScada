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
import { Tag, type TagOptions, Z_TagOptions } from "../lib/server/tag/tag";
import { logger } from "../lib/server/pino/logger";
import { DeviceManager, Device } from "../lib/server/drivers/driver";
import { resolveTagOptions, UdtDefinition } from "../lib/server/tag/udt";

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
      startAddress: 1,
      endian: "BigEndian",
      swapWords: true,
    },
    enabled: true,
  });

  deviceManager.addDevice(plc1);

  /*
  try {
    const testTag = new Tag("Double", {
      name: "testTag",
      path: "/testTag",
      nodeId: "ns=1;s=/[plc1]/<Double>hr1",
      initialValue: 5.123,
    });
  } catch (error) {
    logger.error(error?.message);
  }*/

  let test = new UdtDefinition({
    name: "DigitalIn",
    parameters: { device: "plc" },
    feilds: [
      {
        name: "value",
        dataType: "Boolean",
        path: "${name}",
        nodeId: "ns=1;s=/[${device}]/<Boolean>co0",
      },
      {
        name: "faulted",
        dataType: "Boolean",
        path: "${name}",
        nodeId: "ns=1;s=/[${device}]/<Boolean>co1",
      },
    ],
  });

  await Tag.loadAllTagsFromDB();
  startOPCUAClient();

  /*const udtProps = {
    folder: { type: "string", default: "Motors" },
    name: { type: "string", default: "M1" },
    baseAddr: { type: "number", default: 100 },
    enabled: { type: "boolean", default: true },
  };

  const instanceProps = {
    name: "Pump1",
    path: "/${folder}/${name}",
    addr: "${baseAddr + 5}",
    folderr: "${folder}/test",
  };
*/
  const udtProps = { folder: "Motors", baseAddr: 100 };

  const instanceProps = {
    path: "/${folder}/${name}",
    name: "${nodeId}/Pump1",
    nodeId: "${10 + baseAddr}",
    dataType: "Double",
    //parameters: { folder: "TEST" },
  } satisfies TagOptions<"F">;

  console.debug(resolveTagOptions(udtProps, instanceProps, Z_TagOptions));

  //httpServer.listen(3000);
  //poll();
}

//main(httpServer);

let toggle = false;

function poll() {
  Tag.tags["/demo/digitalIn"]?.update({ value: toggle, faulted: toggle });
  toggle = !toggle;
  setTimeout(poll, 1000);
}
