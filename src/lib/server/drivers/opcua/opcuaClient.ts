import type { BrowseDescriptionLike, ClientSession, ClientSubscription } from "node-opcua-client";
import { OPCUAClient, AttributeIds, TimestampsToReturn } from "node-opcua-client";

import { logger } from "../../pino/logger";
import type { NodeIdLike } from "node-opcua";
import type { z } from "zod";
import { err, ok, type Result } from "neverthrow";
import { attempt } from "$lib/util/attempt";
import { errorToString, type NeverThrowError } from "$lib/util/neverThrow";
import type { Tag } from "../../tag/tag";
import type { BaseTypeStrings } from "$lib/server/tag/tag";
import { z_deviceOpcuaClientOptions } from "$lib/server/sqlite/tables";
import { BaseDriver, type SubscribeOptions } from "../baseDriver";

const nodeIdToMonitor = "ns=2;g=1D545837-3EDB-43F5-A4B8-073C0775FCBE";

const PUBLISHING_INTERVAL_MS = 250;
const MAX_KEEP_ALIVE_COUNT = 10; // keepalive every 2500ms
const LIFETIME_COUNT = 600; // 6x keepalive
const KEEPALIVE_PERIOD_MS = PUBLISHING_INTERVAL_MS * MAX_KEEP_ALIVE_COUNT; // 2500
const TRANSPORT_TIMEOUT_MS = KEEPALIVE_PERIOD_MS * 2; // 5000
const CONNECT_RETRY_BUDGET = {
  maxRetry: 100,
  initialDelay: 500,
  maxDelay: 10000,
};


function createClient() {
  return attempt(() =>
    OPCUAClient.create({
      endpointMustExist: false,
      connectionStrategy: CONNECT_RETRY_BUDGET,
      transportTimeout: TRANSPORT_TIMEOUT_MS,
    }),
  );
}

/** What a caller may hand to `create()`: every field optional and defaulted. */
export type OpcuaClientDriverOptions = z.input<typeof z_deviceOpcuaClientOptions>;
/** What the driver runs on: defaulted, so nothing is optional. */
export type OpcuaClientDriverConfig = z.output<typeof z_deviceOpcuaClientOptions>;

export type OpcuaClientDriverError = NeverThrowError & {
  reason:
    | "NOT_IMPLEMENTED"
    | "OPTIONS_PARSE_ERROR"
    | "CLIENT_CREATE_FAILED"
    | "SESSION_NOT_INITIALISED"
    | "CONNECT_DISPOSED"
    | "CONNECT_FAILED"
    | "CONNECT_TIMEOUT"
    | "SESSION_CREATE_FAILED"
    | "SUBSCRIPTION_CREATE_FAILED"
    | "MONITOR_FAILED"
    | "BROWSE_FAILED"
    | "BROWSE_RECURSE_FAILED"
    | "DISCONNECT_FAILED";
};

export class OpcuaClientDriver extends BaseDriver<OpcuaClientDriverConfig, "opcuaClientDriver"> {
  #client: OPCUAClient | undefined;
  #session: ClientSession | undefined;
  #subscription: ClientSubscription | undefined;

  /** Takes a client `create()` already built, so construction cannot fail. */
  private constructor(options: OpcuaClientDriverConfig, client: OPCUAClient) {
    super("opcuaClientDriver", options);
    this.#client = client;
    this.#listen(client);
  }

  static create(options: OpcuaClientDriverOptions) {
    const parsed = z_deviceOpcuaClientOptions.safeParse(options);
    if (!parsed.success) {
      return err({
        reason: "OPTIONS_PARSE_ERROR",
        cause: `[opcuaClientDriver] create() ${parsed.error.message}`,
      } as const satisfies OpcuaClientDriverError);
    }
    const client = createClient();
    if (client.error) {
      return err({
        reason: "CLIENT_CREATE_FAILED",
        cause: `[opcuaClientDriver] create() failed to create client for ${parsed.data.endpointUrl}: ${errorToString(client.error)}`,
      } as const satisfies OpcuaClientDriverError);
    }
    return ok(new OpcuaClientDriver(parsed.data, client.data));
  }


  #listen(client: OPCUAClient) {
    client.on("backoff", (retry, delay) => {
      this.setConnected(false);
      logger.debug(
        `[opcuaClientDriver] backoff: still trying to connect to ${this.options.endpointUrl} retry ${retry} next attempt in ${delay / 1000} seconds`,
      );
    });

    client.on("start_reconnection", (err) => {
      this.setConnected(false);
      if (err) {
        logger.warn(err, `[opcuaClientDriver] start_reconnection`);
      } else {
        logger.debug(`[opcuaClientDriver] start_reconnection`);
      }
    });

    client.on("reconnection_attempt_has_failed", (err, msg) => {
      this.setConnected(false);
      logger.warn(err, `[opcuaClientDriver] reconnection_attempt_has_failed: ${msg}`);
    });

    client.on("reconnection_canceled", () => {
      this.setConnected(false);
      logger.warn(`[opcuaClientDriver] reconnection_canceled`);
    });

    client.on("connection_failed", (err) => {
      this.setConnected(false);
      logger.error(err, `[opcuaClientDriver] connection_failed`);
    });

    client.on("startingDelayBeforeReconnection", (duration) => {
      logger.debug(`[opcuaClientDriver] startingDelayBeforeReconnection ${duration}ms`);
    });

    client.on("repairConnectionStarted", () => {
      logger.debug(`[opcuaClientDriver] repairConnectionStarted`);
    });

    client.on("connected", () => {
      this.setConnected(true);
      logger.info(`[opcuaClientDriver] client connected to ${this.options.endpointUrl}`);
      void this.#setupAfterConnect();
    });

    client.on("after_reconnection", (err) => {
      this.setConnected(true);
      if (err) {
        logger.debug(err, `[opcuaClientDriver] after_reconnection`);
      } else {
        logger.info(`[opcuaClientDriver] after_reconnection`);
      }
      void this.#setupAfterConnect();
    });

    client.on("connection_reestablished", () => {
      this.setConnected(true);
      logger.info(`[opcuaClientDriver] connection_reestablished`);
      void this.#setupAfterConnect();
    });

    client.on("connection_lost", () => {
      this.setConnected(false);
      logger.debug(`[opcuaClientDriver] connection_lost`);
    });

    client.on("close", (err) => {
      this.setConnected(false);
      if (err) {
        logger.debug(err, `[opcuaClientDriver] close`);
      } else {
        logger.debug(`[opcuaClientDriver] close`);
      }
    });
  }

  /**
   * node-opcua retries a failing `connect()` forever by default and its
   * transaction timeout does not cover discovery, so every network step is
   * raced against a deadline. `work` goes through `attempt` first so its late
   * rejection is already handled once the timer wins the race.
   */
  #createClient() {
    const client = createClient();
    if (client.error) {
      return err({
        reason: "CLIENT_CREATE_FAILED",
        cause: `[opcuaClientDriver] failed to create client for ${this.options.endpointUrl}: ${errorToString(client.error)}`,
      } as const satisfies OpcuaClientDriverError);
    }
    this.#client = client.data;
    this.#listen(client.data);
    return ok(client.data);
  }

  async #setupAfterConnect() {
    const client = this.#client;
    if (!client) return;
    const session = await attempt(() => client.createSession());
    if (session.error) {
      this.setConnected(false);
      logger.error(session.error, "[opcuaClientDriver] failed to create session");
      return;
    }
    this.#session = session.data;

    const subscription = await attempt(() =>
      this.#session!.createSubscription2({
        requestedPublishingInterval: PUBLISHING_INTERVAL_MS,
        requestedMaxKeepAliveCount: MAX_KEEP_ALIVE_COUNT,
        requestedLifetimeCount: LIFETIME_COUNT,
        maxNotificationsPerPublish: 1000,
        publishingEnabled: true,
        priority: 10,
      }),
    );
    if (subscription.error) {
      this.setConnected(false);
      logger.error(subscription.error, "[opcuaClientDriver] failed to create subscription");
      return;
    }
    this.#subscription = subscription.data;

    this.#subscription.on("keepalive", () => {
      logger.debug("[opcuaClientDriver] keepalive");
    });

    this.#subscription.on("terminated", () => {
      this.setConnected(false);
      logger.debug("[opcuaClientDriver] TERMINATED ------------------------------>");
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
      this.#subscription!.monitor(itemToMonitor, parameters, TimestampsToReturn.Both),
    );
    if (monitoredItem.error) {
      this.setConnected(false);
      logger.error(monitoredItem.error, "[opcuaClientDriver] failed to monitor node");
      return;
    }

    monitoredItem.data.on("changed", (dataValue) => {
      logger.debug(dataValue.value.toString());
    });

    const initialBrowse = await this.browse("ns=0;i=84");
    if (initialBrowse.isErr()) {
      logger.debug(initialBrowse.error.cause);
    }
  }

  async connect() {
    if (this.disposed) {
      return err({
        reason: "CONNECT_DISPOSED",
        cause: `[opcuaClientDriver] connect() driver is disposed`,
      } as const satisfies OpcuaClientDriverError);
    }
    if (this.connected) return ok(undefined);
    let client = this.#client;
    if (!client) {
      const recreated = this.#createClient();
      if (recreated.isErr()) return err(recreated.error);
      client = recreated.value;
    }
    void attempt(() => client.connect(this.options.endpointUrl)).catch((e) => {
      logger.debug(e, "[opcuaClientDriver] connect() initiation failed");
    });
    return ok(undefined);
  }

  async browse(nodeId: BrowseDescriptionLike) {
    if (!this.#session) {
      return err({
        reason: "SESSION_NOT_INITIALISED",
        cause: `[opcuaClientDriver] browse() session not initalised, call connect() first`,
      } as const satisfies OpcuaClientDriverError);
    }
    // Standard NodeId for the Objects folder is "ns=0;i=85"
    const browseResult = await attempt(() => this.#session!.browse(nodeId));
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

      logger.debug(`${type}: ${reference.browseName.name} (${reference.nodeId.toString()})`);

      // Recurse down into Objects (1) and Folders (2)
      if (type === "folder" || type === "object") {
        const recursed = await attempt(() => this.browseRecursive(reference.nodeId.toString()));
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
    if (this.#subscription) {
      const terminated = await attempt(() => this.#subscription!.terminate());
      if (terminated.error) {
        return err({
          reason: "DISCONNECT_FAILED",
          cause: `[opcuaClientDriver] disconnect() failed to terminate the subscription: ${errorToString(terminated.error)}`,
        } as const satisfies OpcuaClientDriverError);
      }
      this.#subscription = undefined;
    }
    if (this.#session) {
      const closed = await attempt(() => this.#session!.close());
      if (closed.error) {
        return err({
          reason: "DISCONNECT_FAILED",
          cause: `[opcuaClientDriver] disconnect() failed to close the session: ${errorToString(closed.error)}`,
        } as const satisfies OpcuaClientDriverError);
      }
      this.#session = undefined;
    }
    const client = this.#client;
    if (client) {
      const disconnected = await attempt(() => client.disconnect());
      if (disconnected.error) {
        return err({
          reason: "DISCONNECT_FAILED",
          cause: `[opcuaClientDriver] disconnect() failed to disconnect the client: ${errorToString(disconnected.error)}`,
        } as const satisfies OpcuaClientDriverError);
      }
      // a disconnected client cannot be reused, so drop it and let the next
      // connect() build a fresh one
      this.#client = undefined;
    }
    return ok(undefined);
  }

  subscribe(_path: string, _dataType: BaseTypeStrings, _opts?: SubscribeOptions) {
    logger.warn(`[OpcuaClientDriver] subscribe() not implemented yet`);
    return err({
      reason: "NOT_IMPLEMENTED",
      cause: `[OpcuaClientDriver] subscribe() not implemented yet`,
    } as const satisfies OpcuaClientDriverError);
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
        super.dispose();
    logger.debug(`[opcuaClientDriver] dispose()`);
    void this.disconnect().then((disconnected) => {
      if (disconnected.isErr()) {
        logger.debug(disconnected.error.cause);
      }
    });
  }
}
