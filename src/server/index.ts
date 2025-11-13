import express from "express";
import { createServer, Server } from "http";
import { handler } from "../../build/handler";
import { creatSocketIoServer } from "../lib/server/socket.io/socket.io";
import {
  createOPCUAServer,
  startOPCUAClient,
} from "../lib/server/drivers/opcua/opcuaServer";
import { Tag, TagOptions } from "../lib/server/tag/tag";
import { logger } from "../lib/server/pino/logger";
import { DeviceManager, Device } from "../lib/server/drivers/driver";
import { UdtDefinition } from "../lib/server/tag/udt";
import { TagManager } from "../lib/server/tag/tagManager";
import { TagFolder } from "../lib/server/tag/folder";
import { collections } from "../lib/server/mongodb/collections";

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
  Tag.initOpcuaServer(opcuaServer); // TD WIP move to tag manager
  deviceManager.initOpcuaServer(opcuaServer);

  /*
  let plc1 = new Device(deviceManager.opcuaServer, {
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

  deviceManager.addDevice(plc1);*/

  await deviceManager.loadAllFromDb();

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
  /*
  let root = new TagFolder({ name: "/", path: "/"});
  let tagOpts = new TagOptions<"Double">({
    name: "test",
    path: "/demo/test",
    dataType: "Double",
    nodeId: "ns=1;s=[device]/fhr100",
    initalValue: 10.1123,
  });
  collections.tags.insertOne(tagOpts);
  /*
  let test = new UdtDefinition({
    name: "DigitalIn",
    parameters: { device: "plc" },
    feilds: [
      {
        name: "value",
        dataType: "Boolean",
        path: "value",
        nodeId: "ns=1;s=/[plc1]/<Boolean>co0",
      },
      {
        name: "faulted",
        dataType: "Boolean",
        path: "faulted",
        nodeId: "ns=1;s=/[plc1]/<Boolean>co1",
      },
    ],
    initalValue: {
      value: false,
      faulted: false,
    },
  });
*/
  await tagManager.loadFromDb();

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
}

const mode = "dev";
if (mode === "prod") {
  httpServer.listen(3000);
  main(httpServer);
  //app.listen(3000);
}

function poll() {
  //console.debug(deviceManager.getDevice("plc1")?.status);
  setTimeout(poll, 1000);
}
