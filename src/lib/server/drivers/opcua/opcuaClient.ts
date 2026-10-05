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
  /** Bumped by disconnect()/dispose() and by every setup run, so a run that
   * resolves late can tell its session belongs to a channel that is gone. */
  #setupGeneration = 0;
  /** True while a setup run is in flight, so the next event folds into one
   * follow-up run instead of opening a second session. */
  #setupRunning = false;
  #setupRequested = false;
  /** Subscriptions this driver terminated itself, so the `terminated` event
   * they raise is not mistaken for the server dropping them. */
  #terminatedSubscriptions = new WeakSet<ClientSubscription>();

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

    // node-opcua only emits this for the initial connect: once a secure channel
    // exists a dropped connection goes down the repair path, which retries with
    // maxRetry -1 forever and never emits it. so this is the one event that
    // means the device is not coming back on its own.
    client.on("connection_failed", (err) => {
      this.setConnected(false);
      this.setConnectionError({
        reason: "CONNECT_FAILED",
        cause: `[opcuaClientDriver] connection_failed for ${this.options.endpointUrl} after ${CONNECT_RETRY_BUDGET.maxRetry} retries: ${errorToString(err)}`,
      } as const satisfies OpcuaClientDriverError);
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

    // after_reconnection fires the moment a new secure channel exists, before
    // node-opcua has reactivated the sessions, and it rolls the channel back
    // again when that repair fails. connection_reestablished is the event that
    // means the channel and the sessions are both usable, so that is the one
    // setup hangs off; this one only reports the noise.
    client.on("after_reconnection", (err) => {
      if (err) {
        logger.debug(err, `[opcuaClientDriver] after_reconnection`);
      } else {
        logger.info(`[opcuaClientDriver] after_reconnection`);
      }
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

  /**
   * Rebuild the session, subscription and monitored item once the transport is
   * back. Two events reach this and they can overlap - a repair that is itself
   * interrupted lands a second `connection_reestablished` on top of the first -
   * so a request that arrives mid run is folded into one follow-up run rather
   * than opening a second session on the server.
   */
  async #setupAfterConnect() {
    this.#setupRequested = true;
    if (this.#setupRunning) return;
    this.#setupRunning = true;
    try {
      while (this.#setupRequested) {
        this.#setupRequested = false;
        await this.#setupOnce(++this.#setupGeneration);
      }
    } finally {
      this.#setupRunning = false;
    }
  }

  async #setupOnce(generation: number) {
    const client = this.#client;
    if (!client) return;
    // whatever the previous run left behind belongs to a channel that has been
    // replaced, so it goes before the replacement is built
    const stale = await this.#teardownSession();
    if (stale.isErr()) {
      logger.debug(stale.error.cause);
    }
    if (this.#superseded(generation)) return;

    const session = await attempt(() => client.createSession());
    if (session.error) {
      this.#setupFailed(generation, session.error, "failed to create session");
      return;
    }
    if (this.#superseded(generation)) {
      await this.#discardSession(session.data);
      return;
    }
    this.#session = session.data;

    const subscription = await attempt(() =>
      session.data.createSubscription2({
        requestedPublishingInterval: PUBLISHING_INTERVAL_MS,
        requestedMaxKeepAliveCount: MAX_KEEP_ALIVE_COUNT,
        requestedLifetimeCount: LIFETIME_COUNT,
        maxNotificationsPerPublish: 1000,
        publishingEnabled: true,
        priority: 10,
      }),
    );
    if (subscription.error) {
      this.#setupFailed(generation, subscription.error, "failed to create subscription");
      return;
    }
    if (this.#superseded(generation)) {
      await this.#discardSession(session.data, subscription.data);
      return;
    }
    this.#subscription = subscription.data;

    subscription.data.on("keepalive", () => {
      logger.debug("[opcuaClientDriver] keepalive");
    });

    subscription.data.on("terminated", () => {
      // a subscription this driver tore down on purpose says nothing about the
      // transport, only one the server dropped is a real signal
      if (this.#terminatedSubscriptions.has(subscription.data)) {
        logger.debug("[opcuaClientDriver] subscription terminated by our own teardown");
        return;
      }
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
      subscription.data.monitor(itemToMonitor, parameters, TimestampsToReturn.Both),
    );
    if (monitoredItem.error) {
      // the probe node is a placeholder, and a server that does not expose it
      // says nothing about the transport
      this.#setupFailed(generation, monitoredItem.error, "failed to monitor node", false);
      return;
    }

    monitoredItem.data.on("changed", (dataValue) => {
      logger.debug(dataValue.value.toString());
    });

    if (this.#superseded(generation)) return;
    const initialBrowse = await this.browse("ns=0;i=84");
    if (initialBrowse.isErr()) {
      logger.debug(initialBrowse.error.cause);
    }
  }

  /**
   * True once this run has been overtaken, either by a disconnect/dispose that
   * moved the generation on or by a newer run. Whatever the run created after
   * that point belongs to a channel nobody will use again.
   */
  #superseded(generation: number) {
    return generation !== this.#setupGeneration;
  }

  /**
   * A step failed. When the run has been overtaken the step was talking about a
   * channel that is already going away, so reporting the device as down would
   * blame a connection that is fine. `marksDeviceDown` is false for a step
   * that fails on a healthy channel.
   */
  #setupFailed(generation: number, error: unknown, message: string, marksDeviceDown = true) {
    if (this.#superseded(generation)) {
      logger.debug(
        `[opcuaClientDriver] ${message} on a superseded setup run: ${errorToString(error)}`,
      );
      return;
    }
    if (marksDeviceDown) {
      this.setConnected(false);
    }
    logger.error(error, `[opcuaClientDriver] ${message}`);
  }

  /**
   * Closes what a superseded run built. It never published the handles, so
   * nothing else can close them and the server is left to time them out.
   */
  async #discardSession(session: ClientSession, subscription?: ClientSubscription) {
    if (subscription) {
      this.#terminatedSubscriptions.add(subscription);
      const terminated = await attempt(() => subscription.terminate());
      if (terminated.error) {
        logger.debug(
          `[opcuaClientDriver] discard() could not terminate a stale subscription: ${errorToString(terminated.error)}`,
        );
      }
    }
    const closed = await attempt(() => session.close());
    if (closed.error) {
      logger.debug(
        `[opcuaClientDriver] discard() could not close a stale session: ${errorToString(closed.error)}`,
      );
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
    // a fresh attempt is a Reconnecting until it fails, so drop the error the
    // previous attempt left behind rather than reporting a stale Error
    this.setConnectionError(undefined);
    let client = this.#client;
    if (!client) {
      const recreated = this.#createClient();
      if (recreated.isErr()) return err(recreated.error);
      client = recreated.value;
    }
    void attempt(() => client.connect(this.options.endpointUrl)).catch((e) => {
      // a terminal connect failure emits connection_failed and rejects with the
      // same error, so only fill this in when the event never arrived - a
      // synchronous setup throw such as a malformed endpoint url
      if (!this.connectionState.error) {
        this.setConnected(false);
        this.setConnectionError({
          reason: "CONNECT_FAILED",
          cause: `[opcuaClientDriver] connect() to ${this.options.endpointUrl} threw: ${errorToString(e)}`,
        } as const satisfies OpcuaClientDriverError);
      }
      logger.error(e, "[opcuaClientDriver] connect() failed");
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
    // any setup run still in flight is now building against a channel that is
    // going away, so it discards what it created instead of publishing it
    this.#setupGeneration++;
    const torn = await this.#teardownSession();
    if (torn.isErr()) {
      return err(torn.error);
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

  /**
   * Terminates the subscription and closes the session, dropping both handles
   * first so a failure cannot leave the driver pointing at dead ones.
   */
  async #teardownSession() {
    const subscription = this.#subscription;
    this.#subscription = undefined;
    if (subscription) {
      this.#terminatedSubscriptions.add(subscription);
      const terminated = await attempt(() => subscription.terminate());
      if (terminated.error) {
        return err({
          reason: "DISCONNECT_FAILED",
          cause: `[opcuaClientDriver] disconnect() failed to terminate the subscription: ${errorToString(terminated.error)}`,
        } as const satisfies OpcuaClientDriverError);
      }
    }
    const session = this.#session;
    this.#session = undefined;
    if (session) {
      const closed = await attempt(() => session.close());
      if (closed.error) {
        return err({
          reason: "DISCONNECT_FAILED",
          cause: `[opcuaClientDriver] disconnect() failed to close the session: ${errorToString(closed.error)}`,
        } as const satisfies OpcuaClientDriverError);
      }
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
