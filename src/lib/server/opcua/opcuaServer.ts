import {
    OPCUAClient,
    OPCUAServer,
    AttributeIds,
    DataType,
    Variant,
    type UAObject,
    type Namespace
} from "node-opcua";
import { Tag } from "../tag/tag";
import jsonTags from "../tag/tags.json";
import { logger } from "../../../lib/pino/logger";
import { emitToSubscribers } from "../socket.io/socket.io";


type FolderJson = {
  [key: string]: any;
};

export const tags: Record<string, Tag> = {}; // Global tag registry

const EXTERNAL_ENDPOINT = "opc.tcp://localhost:4840";


async function loadTagsFromJson(ns: Namespace, root: UAObject, json: FolderJson) {

  for (const [key, value] of Object.entries(json)) {
    if ("nodeId" in value && "dataType" in value) {
      logger.debug("create tag " + key);
      const tag = new Tag({
        name: key,
        nodeId: value.nodeId,
        dataType: DataType[value.dataType as keyof typeof DataType],
        initialValue: value.initialValue,
        emit: (event, payload) => {
          if (event === "tag:update") {
            emitToSubscribers(payload.name, payload.value);
          }
        }
      });
      tag.init(ns, root);
      tags[key] = tag;
    } else {
      logger.debug("create folder " + key);
      const folder = ns.addObject({ organizedBy: root, browseName: key });
      await loadTagsFromJson(ns, folder, value);
    }
  }
}


export async function createOPCUAServer(): Promise<OPCUAServer> {
  const server = new OPCUAServer({
    port: 4840,
    resourcePath: "/UA/InternalServer",
    buildInfo: { productName: "InternalBridge", buildNumber: "1", buildDate: new Date() }
  });
  await server.initialize();
  const ns = server.engine.addressSpace!.getOwnNamespace();
  /*const tagsObj = ns.addObject({ organizedBy: server.engine.addressSpace!.rootFolder.objects, browseName: "Tags" });
  for (const tag of TAGS) {
    const node = ns.addVariable({
      componentOf: tagsObj,
      browseName: tag.name,
      nodeId: `ns=1;s=${tag.name}`,
      dataType: tag.dataType,
      value: {
        get: () => new Variant({ dataType: tag.dataType, value: tagValues[tag.name] }),
        set: (variant) => {
          tagValues[tag.name] = variant.value;
          return { statusCode: 0 };
        }
      }
    });
    node.on("value_changed", (dataValue) => {
      io.emit("tag:update", { name: tag.name, value: dataValue.value.value });
    });

    variables[tag.name] = node;
  }
  */

  const rootFolder = ns.addObject({
    organizedBy: server.engine.addressSpace!.rootFolder.objects,
    browseName: "RootTags"
  });

  await loadTagsFromJson(ns, rootFolder, jsonTags);
  await server.start();
  logger.info("Internal OPC UA Server at " + server.endpoints[0].endpointDescriptions()[0].endpointUrl);
  return server;
}

export async function startOPCUAClient(): Promise<OPCUAClient> {
  const client = OPCUAClient.create({ endpointMustExist: false });
  await client.connect(EXTERNAL_ENDPOINT);
  const session = await client.createSession();
  /*logger.info("Connected to external OPC UA server");

  setInterval(async () => {
    for (const tag of TAGS) {
      const dv = await session.read({ nodeId: tag.nodeId, attributeId: AttributeIds.Value });
      tagValues[tag.name] = dv.value.value;
      io.emit("tag:update", { name: tag.name, value: dv.value.value });
    }
  }, 1000);
  */
 return client;
}