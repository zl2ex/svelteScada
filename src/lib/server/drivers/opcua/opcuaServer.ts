import { OPCUAClient, OPCUAServer } from "node-opcua";
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
