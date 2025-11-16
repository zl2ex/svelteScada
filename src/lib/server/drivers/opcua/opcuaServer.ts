import {
  AddressSpace,
  BrowseDirection,
  OPCUAClient,
  OPCUAServer,
  type NodeIdLike,
  type UAVariable,
} from "node-opcua";
import { logger } from "../../pino/logger";

const EXTERNAL_ENDPOINT = "opc.tcp://localhost:4840";

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
  await server.start();
  logger.info(
    `[OPCUAServer] Internal OPC UA Server at ${server.endpoints[0].endpointDescriptions()[0].endpointUrl}`
  );

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      console.debug("vite dispose");
      server.shutdown();
    });
  }

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

function removeParentAccessor(node: BaseNode) {
  const parent = node.parent;
  if (!parent) return;
  const browseName = node.browseName.toString();

  for (const key of Object.getOwnPropertyNames(parent)) {
    if (key === browseName) {
      delete parent[key];
    }
  }
}

export function deleteOpcuaVariable(
  addressSpace: AddressSpace,
  varible: UAVariable
) {
  if (!varible) return;

  // Find its parent
  const parents = varible.findReferences("HasComponent", false);

  for (const p of parents) {
    const parentNode = addressSpace.findNode(p.nodeId);
    if (parentNode) {
      try {
        parentNode.removeReference({
          referenceType: "HasComponent",
          isForward: true,
          nodeId: varible,
        });
      } catch {}
    }
  }

  varible.removeAllListeners();
  addressSpace.deleteNode(varible);
}
