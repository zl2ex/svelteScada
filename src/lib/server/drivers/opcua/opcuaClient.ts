import type {
  BrowseDescriptionLike,
  ClientSession,
  ClientSubscription,
} from "node-opcua-client";
import {
  OPCUAClient,
  AttributeIds,
  TimestampsToReturn,
} from "node-opcua-client";

import { logger } from "../../pino/logger";
import type { OPCUAServer } from "node-opcua";
import z from "zod";

const nodeIdToMonitor = "ns=2;g=1D545837-3EDB-43F5-A4B8-073C0775FCBE";

export const Z_OpcuaClientDriverOptions = z.object({
  endpointUrl: z.string().nonempty().default("opc.tcp://localhost:4840"),
});

type OpcuaClientDriverOptions = z.infer<typeof Z_OpcuaClientDriverOptions>;

export class OpcuaClientDriver {
  client: OPCUAClient;
  session: ClientSession | undefined;
  connected: boolean;
  subscription: ClientSubscription | undefined;
  options: OpcuaClientDriverOptions;

  constructor(opcuaServer: OPCUAServer, options: OpcuaClientDriverOptions) {
    this.client = OPCUAClient.create({ endpointMustExist: false });
    this.connected = false;
    this.options = options;
  }

  async connect() {
    try {
      this.client.on("backoff", (retry, delay) => {
        this.connected = false;
        logger.debug(
          `[opcuaClientDriver] still trying to connect to ${this.options.endpointUrl} retry ${retry} next attempt in ${delay / 1000} seconds`,
        );
      });

      this.client.on("close", () => {
        this.connected = false;
        logger.debug(`[opcuaClientDriver] close`);
      });

      this.client.on("connection_lost", () => {
        this.connected = false;
        logger.debug(`[opcuaClientDriver] close`);
      });

      await this.client.connect(this.options.endpointUrl);
      this.connected = true;
      logger.info(
        `[opcuaClientDriver] connected to ${this.options.endpointUrl}`,
      );

      this.session = await this.client.createSession();

      this.subscription = await this.session.createSubscription2({
        requestedPublishingInterval: 250,
        requestedMaxKeepAliveCount: 50,
        requestedLifetimeCount: 6000,
        maxNotificationsPerPublish: 1000,
        publishingEnabled: true,
        priority: 10,
      });

      this.subscription.on("keepalive", () => {
        logger.debug("[opcuaClientDriver] keepalive");
      });

      this.subscription.on("terminated", () => {
        this.connected = false;
        logger.debug(
          "[opcuaClientDriver] TERMINATED ------------------------------>",
        );
      });

      const itemToMonitor = {
        nodeId: nodeIdToMonitor,
        attributeId: AttributeIds.Value,
      };
      const parameters = {
        samplingInterval: 100,
        discardOldest: true,
        queueSize: 100,
      };
      const monitoredItem = await this.subscription.monitor(
        itemToMonitor,
        parameters,
        TimestampsToReturn.Both,
      );

      monitoredItem.on("changed", (dataValue) => {
        logger.debug(dataValue.value.toString());
        /*io.sockets.emit("message", {
                value: dataValue.value.value,
                timestamp: dataValue.serverTimestamp,
                nodeId: nodeIdToMonitor,
                browseName: "Temperature",
                });*/
      });

      this.browse("ns=0;i=84");
    } catch (err) {
      this.connected = false;
      if (err instanceof Error) {
        logger.error(err.message);
      }
    }
  }

  async browse(nodeId: BrowseDescriptionLike) {
    if (!this.session)
      throw new Error(
        `[opcuaClientDriver] browse() session not initalised, call connect() first`,
      );
    // Standard NodeId for the Objects folder is "ns=0;i=85"
    const browseResult = await this.session.browse(nodeId);

    browseResult.references?.forEach((reference) => {
      console.log(
        " -> ",
        reference.browseName.toString(),
        reference.displayName.toString(),
        reference.nodeId.toString(),
        reference.referenceTypeId.toString(),
      );
    });

    return browseResult;
  }

  async browseRecursive(nodeId: BrowseDescriptionLike) {
    /*
  if (visitedNodes.has(nodeId.toString())) return;
    visitedNodes.add(nodeId.toString());
*/
    try {
      const browseResult = await this.browse(nodeId);
      if (!browseResult.references) return;

      for (const reference of browseResult.references) {
        let type = undefined;
        if (reference.nodeClass.valueOf() === 1) type = "folder";
        if (reference.nodeClass.valueOf() === 2) type = "object";

        console.log(
          `${type}: ${reference.browseName.name} (${reference.nodeId.toString()})`,
        );

        // Recurse down into Objects (1) and Folders (2)
        if (type === "folder" || type === "object") {
          await this.browseRecursive(reference.nodeId.toString());
        }
      }
    } catch (err) {
      console.error("Browse error:", err.message);
    }
  }

  async disconnect() {
    this.connected = false;
    if (this.subscription) await this.subscription.terminate();
    if (this.session) await this.session.close();
    if (this.client) await this.client.disconnect();
  }

  subscribeByTag() {}

  unsubscribeByTag() {}

  dispose() {
    logger.debug(`[opcuaClientDriver] dispose()`);
    this.disconnect();
  }
}
