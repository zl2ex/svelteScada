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
import type { OPCUAServer, NodeIdLike } from "node-opcua";
import z from "zod";
import { err, ok, type Result } from "neverthrow";
import { attempt } from "$lib/util/attempt";
import { errorToString, type NeverThrowError } from "$lib/util/neverThrow";
import type { Tag } from "../../tag/tag";

const nodeIdToMonitor = "ns=2;g=1D545837-3EDB-43F5-A4B8-073C0775FCBE";

export const Z_OpcuaClientDriverOptions = z.object({
  endpointUrl: z.string().nonempty().default("opc.tcp://localhost:4840"),
});

export type OpcuaClientDriverOptions = z.infer<
  typeof Z_OpcuaClientDriverOptions
>;

export type OpcuaClientDriverError =
  | { reason: "NOT_IMPLEMENTED"; cause: string }
  | { reason: "CLIENT_NOT_INITIALISED"; cause: string }
  | { reason: "SESSION_NOT_INITIALISED"; cause: string }
  | { reason: "CONNECT_FAILED"; cause: string }
  | { reason: "SESSION_CREATE_FAILED"; cause: string }
  | { reason: "SUBSCRIPTION_CREATE_FAILED"; cause: string }
  | { reason: "MONITOR_FAILED"; cause: string }
  | { reason: "BROWSE_FAILED"; cause: string }
  | { reason: "BROWSE_RECURSE_FAILED"; cause: string }
  | { reason: "DISCONNECT_FAILED"; cause: string };

type ConnectionListener = (connected: boolean) => void;

export class OpcuaClientDriver {
  client: OPCUAClient | undefined;
  session: ClientSession | undefined;
  connected = false;
  subscription: ClientSubscription | undefined;
  options: OpcuaClientDriverOptions;
  /** fired whenever `connected` flips, see onConnectedChange() */
  private connectionListeners = new Set<ConnectionListener>();

  constructor(opcuaServer: OPCUAServer, options: OpcuaClientDriverOptions) {
    this.options = options;
    const client = attempt(() =>
      OPCUAClient.create({ endpointMustExist: false }),
    );
    if (client.error) {
      logger.error(
        `[opcuaClientDriver] failed to create client for ${options.endpointUrl}: ${errorToString(client.error)}`,
      );
      return;
    }
    this.client = client.data;
  }

  /**
   * Subscribe to connection state changes. Called once immediately with the
   * current state, then on every change. Returns an unsubscribe function.
   */
  onConnectedChange(cb: ConnectionListener) {
    const entry: ConnectionListener = (connected) => cb(connected);
    this.connectionListeners.add(entry);
    entry(this.connected);
    return () => {
      this.connectionListeners.delete(entry);
    };
  }

  private setConnected(next: boolean) {
    if (this.connected === next) return;
    this.connected = next;
    for (const cb of this.connectionListeners) {
      try {
        cb(next);
      } catch (e) {
        logger.error(
          e,
          `[opcuaClientDriver] connection listener for ${this.options.endpointUrl} threw`,
        );
      }
    }
  }

  async connect() {
    if (!this.client) {
      return err({
        reason: "CLIENT_NOT_INITIALISED",
        cause: `[opcuaClientDriver] connect() client was not created, see the create error in the log`,
      } as const satisfies OpcuaClientDriverError);
    }
    if (this.connected) return ok(undefined);
    const client = this.client;

    client.on("backoff", (retry, delay) => {
      this.setConnected(false);
      logger.debug(
        `[opcuaClientDriver] still trying to connect to ${this.options.endpointUrl} retry ${retry} next attempt in ${delay / 1000} seconds`,
      );
    });

    client.on("close", () => {
      this.setConnected(false);
      logger.debug(`[opcuaClientDriver] close`);
    });

    client.on("connection_lost", () => {
      this.setConnected(false);
      logger.debug(`[opcuaClientDriver] close`);
    });

    const connected = await attempt(() =>
      client.connect(this.options.endpointUrl),
    );
    if (connected.error) {
      this.setConnected(false);
      return err({
        reason: "CONNECT_FAILED",
        cause: `[opcuaClientDriver] connect() failed to connect to ${this.options.endpointUrl}: ${errorToString(connected.error)}`,
      } as const satisfies OpcuaClientDriverError);
    }
    this.setConnected(true);
    logger.info(`[opcuaClientDriver] connected to ${this.options.endpointUrl}`);

    const session = await attempt(() => client.createSession());
    if (session.error) {
      this.setConnected(false);
      return err({
        reason: "SESSION_CREATE_FAILED",
        cause: `[opcuaClientDriver] connect() failed to create a session: ${errorToString(session.error)}`,
      } as const satisfies OpcuaClientDriverError);
    }
    this.session = session.data;

    const subscription = await attempt(() =>
      this.session!.createSubscription2({
        requestedPublishingInterval: 250,
        requestedMaxKeepAliveCount: 50,
        requestedLifetimeCount: 6000,
        maxNotificationsPerPublish: 1000,
        publishingEnabled: true,
        priority: 10,
      }),
    );
    if (subscription.error) {
      this.setConnected(false);
      return err({
        reason: "SUBSCRIPTION_CREATE_FAILED",
        cause: `[opcuaClientDriver] connect() failed to create a subscription: ${errorToString(subscription.error)}`,
      } as const satisfies OpcuaClientDriverError);
    }
    this.subscription = subscription.data;

    this.subscription.on("keepalive", () => {
      logger.debug("[opcuaClientDriver] keepalive");
    });

    this.subscription.on("terminated", () => {
      this.setConnected(false);
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
    const monitoredItem = await attempt(() =>
      this.subscription!.monitor(
        itemToMonitor,
        parameters,
        TimestampsToReturn.Both,
      ),
    );
    if (monitoredItem.error) {
      this.setConnected(false);
      return err({
        reason: "MONITOR_FAILED",
        cause: `[opcuaClientDriver] connect() failed to monitor ${nodeIdToMonitor}: ${errorToString(monitoredItem.error)}`,
      } as const satisfies OpcuaClientDriverError);
    }

    monitoredItem.data.on("changed", (dataValue) => {
      logger.debug(dataValue.value.toString());
      /*io.sockets.emit("message", {
                value: dataValue.value.value,
                timestamp: dataValue.serverTimestamp,
                nodeId: nodeIdToMonitor,
                browseName: "Temperature",
                });*/
    });

    const initialBrowse = await this.browse("ns=0;i=84");
    if (initialBrowse.isErr()) {
      logger.debug(initialBrowse.error.cause);
    }
    return ok(undefined);
  }

  async browse(nodeId: BrowseDescriptionLike) {
    if (!this.session) {
      return err({
        reason: "SESSION_NOT_INITIALISED",
        cause: `[opcuaClientDriver] browse() session not initalised, call connect() first`,
      } as const satisfies OpcuaClientDriverError);
    }
    // Standard NodeId for the Objects folder is "ns=0;i=85"
    const browseResult = await attempt(() => this.session!.browse(nodeId));
    if (browseResult.error) {
      return err({
        reason: "BROWSE_FAILED",
        cause: `[opcuaClientDriver] browse() failed to browse ${nodeId.toString()}: ${errorToString(browseResult.error)}`,
      } as const satisfies OpcuaClientDriverError);
    }

    browseResult.data.references?.forEach((reference) => {
      logger.debug(
        ` -> ${reference.browseName.toString()} ${reference.displayName.toString()} ${reference.nodeId.toString()} ${reference.referenceTypeId.toString()}`,
      );
    });

    return ok(browseResult.data);
  }

  async browseRecursive(
    nodeId: BrowseDescriptionLike,
  ): Promise<Result<void, OpcuaClientDriverError>> {
    /*
  if (visitedNodes.has(nodeId.toString())) return;
    visitedNodes.add(nodeId.toString());
*/
    const browseResult = await attempt(() => this.browse(nodeId));
    if (browseResult.error) {
      return err({
        reason: "BROWSE_RECURSE_FAILED",
        cause: `[opcuaClientDriver] browseRecursive() failed on ${nodeId.toString()}: ${errorToString(browseResult.error)}`,
      } as const satisfies OpcuaClientDriverError);
    }
    if (browseResult.data.isErr()) {
      return err(browseResult.data.error);
    }
    if (!browseResult.data.value.references) return ok(undefined);

    for (const reference of browseResult.data.value.references) {
      let type = undefined;
      if (reference.nodeClass.valueOf() === 1) type = "folder";
      if (reference.nodeClass.valueOf() === 2) type = "object";

      logger.debug(
        `${type}: ${reference.browseName.name} (${reference.nodeId.toString()})`,
      );

      // Recurse down into Objects (1) and Folders (2)
      if (type === "folder" || type === "object") {
        const recursed = await attempt(() =>
          this.browseRecursive(reference.nodeId.toString()),
        );
        if (recursed.error) {
          return err({
            reason: "BROWSE_RECURSE_FAILED",
            cause: `[opcuaClientDriver] browseRecursive() failed on ${reference.nodeId.toString()}: ${errorToString(recursed.error)}`,
          } as const satisfies OpcuaClientDriverError);
        }
        if (recursed.data.isErr()) {
          return err(recursed.data.error);
        }
      }
    }
    return ok(undefined);
  }

  async disconnect() {
    this.setConnected(false);
    if (this.subscription) {
      const terminated = await attempt(() => this.subscription!.terminate());
      if (terminated.error) {
        return err({
          reason: "DISCONNECT_FAILED",
          cause: `[opcuaClientDriver] disconnect() failed to terminate the subscription: ${errorToString(terminated.error)}`,
        } as const satisfies OpcuaClientDriverError);
      }
    }
    if (this.session) {
      const closed = await attempt(() => this.session!.close());
      if (closed.error) {
        return err({
          reason: "DISCONNECT_FAILED",
          cause: `[opcuaClientDriver] disconnect() failed to close the session: ${errorToString(closed.error)}`,
        } as const satisfies OpcuaClientDriverError);
      }
    }
    if (this.client) {
      const disconnected = await attempt(() => this.client!.disconnect());
      if (disconnected.error) {
        return err({
          reason: "DISCONNECT_FAILED",
          cause: `[opcuaClientDriver] disconnect() failed to disconnect the client: ${errorToString(disconnected.error)}`,
        } as const satisfies OpcuaClientDriverError);
      }
    }
    return ok(undefined);
  }

  subscribeByTag(tag: Tag, parent?: NodeIdLike) {
    logger.warn(`[OpcuaClientDriver] subscribeByTag() not implemented yet`);
    return err({
      reason: "NOT_IMPLEMENTED",
      cause: `[OpcuaClientDriver] subscribeByTag() not implemented yet`,
    } as const satisfies OpcuaClientDriverError);
  }

  unsubscribeByTag(tag: Tag) {
    logger.warn(`[OpcuaClientDriver] unsubscribeByTag() not implemented yet`);
    return ok(undefined);
  }

  dispose() {
    this.setConnected(false);
    this.connectionListeners.clear();
    logger.debug(`[opcuaClientDriver] dispose()`);
    void this.disconnect().then((disconnected) => {
      if (disconnected.isErr()) {
        logger.debug(disconnected.error.cause);
      }
    });
  }
}
