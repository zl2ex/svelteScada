import {
  OPCUAClient,
  OPCUAServer,
  AttributeIds,
  DataType,
  Variant,
  type UAObject,
  type Namespace,
} from "node-opcua";
import { Tag, type TagOptions } from "../../tag/tag";
import { tagDefinitions } from "../../tag/tagDefinitions";
import { udtDefinitions } from "../../tag/udtDefinitions";
import { logger } from "../../../pino/logger";
import { emitToSubscribers } from "../../socket.io/socket.io";

/*type AllTagNodes = Tags[keyof Tags];
type NodeIdLiteral =
  AllTagNodes[keyof AllTagNodes]["nodeId"];
*/

/*type ExtractNodeIds<T> =
  T extends { nodeId: infer N }
    ? N
    : T extends object
      ? { [K in keyof T]: ExtractNodeIds<T[K]> }[keyof T]
      : never;
*/

const EXTERNAL_ENDPOINT = "opc.tcp://localhost:4840";

function createPrimitiveTag(
  name: string,
  tagOptions: TagOptions,
  server: OPCUAServer,
  ns: Namespace,
  root: UAObject
) {
  logger.debug("create tag " + name);
  return new Tag(
    {
      name: name,
      nodeId: tagOptions.nodeId,
      dataType: tagOptions.dataType,
      server: server,
      initialValue: tagOptions.initialValue,
      emit: (event, payload) => {
        if (event === "tag:update") {
          emitToSubscribers(payload.nodeId, payload.value);
        }
      },
    },
    ns,
    root
  );
}

function createUdtTag(name: string, udtTagOptions: UdtTagOptions) {
  logger.debug("create udtTag " + name);
  return new UdtTag({
    name: name,
    nodeId: udtTagOptions.nodeId,
    dataType: udtTagOptions.dataType,
    initialValue: udtTagOptions.initialValue,
    parameters: udtTagOptions.parameters,
    emit: (event, payload) => {
      if (event === "tag:update") {
        emitToSubscribers(payload.nodeId, payload.value);
      }
    },
  });
}
/*
function loadTags(
  server: OPCUAServer,
  ns: Namespace,
  root: UAObject,
  definiton: object
) {
  for (const [name, value] of Object.entries(definiton)) {
    if (isTag(value)) {
      // Is it a primitive datatype eg Bool or Double
      //if(Object.values(DataType).some(type => String(type).startsWith(value.dataType))) {
      //if(value.dataType.includes(Object.values(DataType)))
      const tag = createPrimitiveTag(name, value, server, ns, root);
      tags[value.nodeId as unknown as NodeIdLiteral] = tag;
      /*}
      // is a Udt Datatype defined in udt.json
      else if(Object.keys(jsonUdt).includes(value.dataType)) {
        const udtTag = createUdtTag(name, value);
        udtTag.init(ns, root);
        tags[value.nodeId] = udtTag;
      }
      else {
        logger.debug(Object.values(DataType));
        logger.error("dataType " + value.dataType + " Does not exist in udt.json");
      }
    } else {
      logger.debug("create folder " + name);
      const folder = ns.addObject({ organizedBy: root, browseName: name });
      loadTags(server, ns, folder, value);
    }
  }
}
*/
/*
function createTags<T extends Record<string, string>>(defs: T): {
  [K in keyof T]: Tag<T[K]>;
} {
  const result = {} as any;
  for (const key in defs) {
    result[key] = new Tag(key, defs[key]);
  }
  return result;
}
*/

export async function createOPCUAServer(): Promise<OPCUAServer> {
  const server = new OPCUAServer({
    port: 4840,
    resourcePath: "/UA/InternalServer",
    buildInfo: {
      productName: "InternalBridge",
      buildNumber: "1",
      buildDate: new Date(),
    },
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

  await server.start();
  logger.info(
    `[OPCUAServer] Internal OPC UA Server at ${server.endpoints[0].endpointDescriptions()[0].endpointUrl}`
  );

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
