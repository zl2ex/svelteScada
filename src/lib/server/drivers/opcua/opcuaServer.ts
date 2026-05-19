import { AddressSpace, OPCUAServer, type UAVariable } from "node-opcua";
import { logger } from "../../pino/logger";

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
    `[OPCUAServer] Internal OPC UA Server at ${server.endpoints[0].endpointDescriptions()[0].endpointUrl}`,
  );

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      logger.trace("vite dispose");
      server.shutdown();
    });
  }

  return server;
}

export function deleteOpcuaVariable(
  addressSpace: AddressSpace,
  varible: UAVariable,
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
