import type {
  BrowseDescriptionLike,
  ClientMonitoredItem,
  ClientSession,
  ClientSubscription,
  DataValue,
  MonitoringParametersOptions,
  NodeId,
  StatusCode,
  Variant,
} from "node-opcua-client";
import {
  OPCUAClient,
  AttributeIds,
  DataChangeFilter,
  DataChangeTrigger,
  DataType,
  StatusCodes,
  TimestampsToReturn,
  VariantArrayType,
  coerceNodeId,
} from "node-opcua-client";

import { logger } from "../../pino/logger";
import type { z } from "zod";
import { err, ok, type Result } from "neverthrow";
import { attempt } from "$lib/util/attempt";
import { errorToString, type NeverThrowError } from "$lib/util/neverThrow";
import type { BaseTypeMap } from "$lib/server/tag/tag";
import type { BaseTypeStrings } from "$lib/server/tag/tag";
import { Z_BaseTypes } from "$lib/validation/zod";
import { z_deviceOpcuaClientOptions } from "$lib/server/sqlite/tables";
import {
  BaseDriver,
  type DriverValue,
  type DriverVariable,
  type DriverWriteError,
  type Reading,
  type SubscribeOptions,
} from "../baseDriver";

const MAX_KEEP_ALIVE_COUNT = 10; // keepalive every 10x the publishing interval
const LIFETIME_COUNT = 600; // 6x keepalive
// The keepalive a default device gets is MAX_KEEP_ALIVE_COUNT x the default
// samplingIntervalMs = 10000ms. A device configured with a shorter interval
// keeps alive sooner than this, so 2x the slowest case is a safe transport
// timeout floor.
const TRANSPORT_TIMEOUT_MS = 20000;
const CONNECT_RETRY_BUDGET = {
  maxRetry: 100,
  initialDelay: 500,
  maxDelay: 10000,
};

/**
 * DeadbandType.Absolute. It cannot be imported: node-opcua-client star-exports
 * `DeadbandType` from both node-opcua-constants (where it is the DataTypeId 718)
 * and node-opcua-service-subscription (where it is the real enumeration), and an
 * ambiguous star export is not importable. 1 is Absolute per OPC UA Part 4.
 */
const DEADBAND_ABSOLUTE = 1;

/** What a subscriber sees. `value` keeps its last good value while `status` is bad. */
export type OpcuaSubscriptionInfo = {
  key: string;
  nodeId: NodeId;
  dataType: BaseTypeStrings;
  refs: number;
  reading: Reading<DriverValue>;
};

type Listener = (reading: Reading<DriverValue>) => void;

/**
 * One watched node. Handles that ask for the same node id and data type share a
 * single `Sub`, which is what `refs` counts. `item` is only set while the sub is
 * armed on the live subscription, so its absence means "watching is pending".
 */
type Sub = {
  key: string;
  nodeId: NodeId;
  dataType: BaseTypeStrings;
  refs: number;
  last: Reading<DriverValue>;
  listeners: Set<Listener>;
  item?: ClientMonitoredItem;
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
    | "OPTIONS_PARSE_ERROR"
    | "CLIENT_CREATE_FAILED"
    | "SESSION_NOT_INITIALISED"
    | "CONNECT_DISPOSED"
    | "CONNECT_FAILED"
    | "CONNECT_TIMEOUT"
    | "SESSION_CREATE_FAILED"
    | "SUBSCRIPTION_CREATE_FAILED"
    | "MONITOR_FAILED"
    | "SUBSCRIBE_DISPOSED"
    | "SUBSCRIBE_NODE_ID_INVALID"
    | "WRITE_NOT_CONNECTED"
    | "WRITE_FAILED"
    | "BROWSE_FAILED"
    | "BROWSE_RECURSE_FAILED"
    | "DISCONNECT_FAILED";
};

export class OpcuaClientDriver extends BaseDriver<OpcuaClientDriverConfig, "opcuaClientDriver"> {
  /**
   * Every node this driver has been asked to watch, keyed by `Sub.key`. This map
   * outlives the session it was built against: a reconnect rebuilds the session
   * and re-arms from here, so tags keep their handles across a transport drop.
   */
  #subs = new Map<string, Sub>();

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
      this.#publishStatusAll(StatusCodes.BadNotConnected);
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
      this.#publishStatusAll(StatusCodes.BadNotConnected);
      this.setConnected(false);
      logger.warn(err, `[opcuaClientDriver] reconnection_attempt_has_failed: ${msg}`);
    });

    client.on("reconnection_canceled", () => {
      this.#publishStatusAll(StatusCodes.BadNotConnected);
      this.setConnected(false);
      logger.warn(`[opcuaClientDriver] reconnection_canceled`);
    });

    // node-opcua only emits this for the initial connect: once a secure channel
    // exists a dropped connection goes down the repair path, which retries with
    // maxRetry -1 forever and never emits it. so this is the one event that
    // means the device is not coming back on its own.
    client.on("connection_failed", (err) => {
      this.setConnected(false);
      this.#publishStatusAll(StatusCodes.BadNotConnected);
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
      this.#publishStatusAll(StatusCodes.BadNotConnected);
      logger.debug(`[opcuaClientDriver] connection_lost`);
    });

    client.on("close", (err) => {
      this.setConnected(false);
      this.#publishStatusAll(StatusCodes.BadNotConnected);
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
        // tied to the configured sampling interval so there is one knob rather
        // than a publishing rate that silently disagrees with it
        requestedPublishingInterval: this.options.samplingIntervalMs,
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
      this.#publishStatusAll(StatusCodes.BadNotConnected);
      logger.debug("[opcuaClientDriver] TERMINATED ------------------------------>");
    });

    // the subs map outlives the channel it was built against, so every wanted
    // node is re-armed onto the subscription this run just created
    for (const sub of this.#subs.values()) {
      if (this.#superseded(generation)) return;
      await this.#arm(sub);
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
      this.#publishStatusAll(StatusCodes.BadNotConnected);
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
        this.#publishStatusAll(StatusCodes.BadNotConnected);
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
    this.#publishStatusAll(StatusCodes.BadNotConnected);
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
   *
   * The monitored items die with the subscription, so every sub is disarmed and
   * told its value is stale before that happens. This runs both on disconnect()
   * and at the top of each setup run, which is what makes a reconnect publish
   * BadNotConnected and then a fresh Good once the re-arm lands.
   */
  async #teardownSession() {
    this.#publishStatusAll(StatusCodes.BadNotConnected);
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

  /* -------------------------------- subscribing ---------------------------- */

  /**
   * Watch a node's Value attribute. `path` is an OPC UA NodeId string such as
   * `ns=1;s=SENSOR1`; browse names and attribute suffixes are not resolved.
   * Handles that name the same node and data type share one monitored item.
   *
   * The handle is returned synchronously, so it exists before the server has
   * sent anything - its reading starts at BadWaitingForInitialData and the
   * first notification supplies the initial value. If the driver is not
   * connected yet the sub is registered unarmed and the next setup run arms it.
   */
  subscribe<D extends BaseTypeStrings>(path: string, dataType: D, _opts?: SubscribeOptions) {
    if (this.disposed) {
      return err({
        reason: "SUBSCRIBE_DISPOSED",
        cause: `[opcuaClientDriver] subscribe() driver is disposed`,
      } as const satisfies OpcuaClientDriverError);
    }

    // coerceNodeId maps "" to ns=0;i=0 rather than rejecting it, so the empty
    // case is caught before it can become a watch on the root folder
    if (path.trim() === "") {
      return err({
        reason: "SUBSCRIBE_NODE_ID_INVALID",
        cause: `[opcuaClientDriver] subscribe() needs a nodeId such as ns=1;s=SENSOR1, got an empty path`,
      } as const satisfies OpcuaClientDriverError);
    }
    const parsed = attempt(() => coerceNodeId(path));
    if (parsed.error) {
      return err({
        reason: "SUBSCRIBE_NODE_ID_INVALID",
        cause: `[opcuaClientDriver] subscribe() cannot parse "${path}" as a nodeId: ${errorToString(parsed.error)}`,
      } as const satisfies OpcuaClientDriverError);
    }
    const nodeId = parsed.data;

    const key = `${nodeId.toString()}|${dataType}`;
    let sub = this.#subs.get(key);
    if (!sub) {
      sub = {
        key,
        nodeId,
        dataType,
        refs: 0,
        last: {
          value: Z_BaseTypes[dataType].parse(undefined),
          status: StatusCodes.BadWaitingForInitialData,
        },
        listeners: new Set(),
      };
      this.#subs.set(key, sub);
      logger.debug(`[opcuaClientDriver] subscribe() new subscription ${key}`);
      // the channel may not exist yet, in which case the setup run arms it
      if (this.#subscription) void this.#arm(sub);
    }
    sub.refs++;

    return ok(this.#createHandle(sub) as DriverVariable<BaseTypeMap[D]>);
  }

  #createHandle(sub: Sub): DriverVariable<DriverValue> {
    const mine = new Set<Listener>();
    let released = false;

    return {
      get reading() {
        return sub.last;
      },
      onChange: (cb) => {
        if (released) return () => {};
        // unique per call so the same cb can be added twice
        const entry: Listener = (r) => cb(r);
        mine.add(entry);
        sub.listeners.add(entry);
        entry(sub.last);
        return () => {
          mine.delete(entry);
          sub.listeners.delete(entry);
        };
      },
      write: async (value) => {
        if (released) {
          return err({
            reason: "WRITE_FAILED",
            cause: `[opcuaClientDriver] handle for ${sub.key} was released`,
            opcuaStatus: StatusCodes.BadInternalError,
          } as const satisfies DriverWriteError);
        }
        return await this.#write(sub, value);
      },
      release: () => {
        if (released) return;
        released = true;
        for (const l of mine) sub.listeners.delete(l);
        mine.clear();
        sub.refs--;
        if (sub.refs <= 0 && this.#subs.get(sub.key) === sub) {
          this.#subs.delete(sub.key);
          logger.debug(`[opcuaClientDriver] release() removed subscription ${sub.key}`);
          // terminate asserts the subscription is active, so it throws when the
          // channel already went away - releasing a sub must not raise
          void attempt(() => sub.item?.terminate());
        }
      },
    };
  }

  /**
   * Creates the monitored item for one sub. Idempotent: a sub that already has
   * an item is left alone, so the setup loop and a concurrent subscribe() cannot
   * end up watching the same node twice.
   */
  async #arm(sub: Sub) {
    const subscription = this.#subscription;
    if (!subscription || sub.item || this.disposed) return;

    const parameters: MonitoringParametersOptions = {
      samplingInterval: this.options.samplingIntervalMs,
      discardOldest: true,
      queueSize: this.options.queueSize,
    };
    // 0 means "report every change", which is the server default - sending a
    // filter the server may reject would only lose the first value
    if (this.options.deadbandValue > 0) {
      parameters.filter = new DataChangeFilter({
        trigger: DataChangeTrigger.StatusValue,
        deadbandType: DEADBAND_ABSOLUTE,
        deadbandValue: this.options.deadbandValue,
      });
    }

    const monitored = await attempt(() =>
      subscription.monitor(
        { nodeId: sub.nodeId, attributeId: AttributeIds.Value },
        parameters,
        TimestampsToReturn.Both,
      ),
    );
    if (monitored.error) {
      // a node the server does not have says nothing about the transport, so the
      // other subs stay armed and only this one goes bad
      logger.warn(
        `[opcuaClientDriver] failed to monitor ${sub.key}: ${errorToString(monitored.error)}`,
      );
      this.#publishStatus(sub, StatusCodes.BadNodeIdUnknown);
      return;
    }

    // the run that owned this subscription may have finished while the request
    // was in flight, in which case the item belongs to a channel nobody uses
    if (this.disposed || this.#subscription !== subscription) {
      await attempt(() => monitored.data.terminate());
      return;
    }

    const item = monitored.data;

    // A node the server does not have is refused in the CreateMonitoredItems
    // result, not by the request, so `monitor()` still resolves. That refusal
    // also emits err/terminated synchronously and calls removeAllListeners(),
    // which means the listeners attached below never see it - the status has to
    // be read off the item instead. Leaving `sub.item` unset is deliberate: a
    // reconnect will try this node again.
    if (item.statusCode.isNotGood()) {
      logger.warn(
        `[opcuaClientDriver] server refused to watch ${sub.key}: ${item.statusCode.toString()}`,
      );
      this.#publishStatus(sub, item.statusCode);
      return;
    }

    sub.item = item;

    item.on("changed", (dataValue: DataValue) => this.#onChanged(sub, dataValue));
    item.on("err", (message: string) => {
      if (sub.item !== item) return;
      logger.warn(`[opcuaClientDriver] monitored item ${sub.key} errored: ${message}`);
      // the event carries only prose, so this is as precise as it gets without
      // guessing at a specific filter or id fault
      this.#publishStatus(sub, StatusCodes.BadUnexpectedError);
    });
    item.on("terminated", () => {
      // a newer item may already have replaced this one, and its events must not
      // disarm the fresh watch
      if (sub.item !== item) return;
      sub.item = undefined;
      logger.debug(`[opcuaClientDriver] monitored item ${sub.key} terminated by the server`);
      this.#publishStatus(sub, StatusCodes.BadMonitoredItemIdInvalid);
    });
  }

  #onChanged(sub: Sub, dataValue: DataValue) {
    // a server side fault (BadOutOfRange, BadNotWritable on a write, ...) is
    // reported as-is so the tag sees the real reason instead of a decode error
    if (dataValue.statusCode.isNotGood()) {
      this.#publishStatus(sub, dataValue.statusCode);
      return;
    }
    const decoded = attempt(() => decodeValue(sub.dataType, dataValue.value));
    if (decoded.error) {
      logger.error(decoded.error, `[opcuaClientDriver] decode failed for ${sub.key}`);
      this.#publishStatus(sub, StatusCodes.BadTypeMismatch);
      return;
    }
    this.#publish(sub, { value: decoded.data, status: StatusCodes.Good });
  }

  #publish(sub: Sub, next: Reading<DriverValue>) {
    if (Object.is(sub.last.value, next.value) && sub.last.status.value === next.status.value) {
      return;
    }
    sub.last = next;
    for (const cb of sub.listeners) {
      try {
        cb(next);
      } catch (e) {
        logger.error(e, `[opcuaClientDriver] listener for ${sub.key} threw`);
      }
    }
  }

  /** keep the last value, change only the status */
  #publishStatus(sub: Sub, status: StatusCode) {
    this.#publish(sub, { value: sub.last.value, status });
  }

  #publishStatusAll(status: StatusCode) {
    this.#subs.forEach((sub) => {
      this.#publishStatus(sub, status);
    });
  }

  /* ---------------------------------- writing ------------------------------ */

  async #write(sub: Sub, value: DriverValue) {
    const session = this.#session;
    if (!session) {
      return err({
        reason: "WRITE_NOT_CONNECTED",
        cause: `[opcuaClientDriver] write to ${sub.key} has no session`,
        opcuaStatus: StatusCodes.BadNotConnected,
      } as const satisfies DriverWriteError);
    }

    const written = await attempt(() =>
      session.write({
        nodeId: sub.nodeId,
        attributeId: AttributeIds.Value,
        // Variant coerces Int64/UInt64 into the [high, low] pair the wire needs
        value: { value: { dataType: OPCUA_DATA_TYPE[sub.dataType], value } },
      }),
    );
    if (written.error) {
      return err({
        reason: "WRITE_FAILED",
        cause: `[opcuaClientDriver] write to ${sub.key} threw: ${errorToString(written.error)}`,
        opcuaStatus: StatusCodes.BadCommunicationError,
      } as const satisfies DriverWriteError);
    }
    if (written.data.isNotGood()) {
      logger.warn(`[opcuaClientDriver] write to ${sub.key} rejected: ${written.data.toString()}`);
      return err({
        reason: "WRITE_FAILED",
        cause: `[opcuaClientDriver] write to ${sub.key} rejected: ${written.data.toString()}`,
        opcuaStatus: written.data,
      } as const satisfies DriverWriteError);
    }

    // reflect immediately; the next notification confirms what the server holds
    this.#publish(sub, { value, status: StatusCodes.Good });
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
    this.#subs.clear();
  }
}

/* -------------------------------------------------------------------------- */
/*  Free functions                                                            */
/* -------------------------------------------------------------------------- */

/** The OPC UA built-in that holds each tag base type. */
const OPCUA_DATA_TYPE: Record<BaseTypeStrings, DataType> = {
  Boolean: DataType.Boolean,
  String: DataType.String,
  Int16: DataType.Int16,
  UInt16: DataType.UInt16,
  Int32: DataType.Int32,
  UInt32: DataType.UInt32,
  Int64: DataType.Int64,
  UInt64: DataType.UInt64,
  Float: DataType.Float,
  Double: DataType.Double,
};

/**
 * node-opcua decodes Int64/UInt64 as a [high, low] word pair and
 * node-opcua-client does not re-export the BigInt helpers that turn one into a
 * number, so the value is reassembled here rather than reaching into
 * node-opcua-basic-types, which is only a transitive dependency.
 */
function int64ToNumber(pair: [number, number]) {
  const [high, low] = pair;
  return Number(BigInt.asIntN(64, (BigInt(high >>> 0) << 32n) | BigInt(low >>> 0)));
}

/**
 * Turns the server's Variant into the tag's declared base type. The server's own
 * dataType only decides how the bytes were read; the tag's zod schema is what
 * decides whether the value is acceptable, so a Double tag reading an Int16 node
 * works and a String tag on a Double node does not.
 *
 * Throws on anything unconvertible - the caller turns that into BadTypeMismatch.
 */
function decodeValue(dataType: BaseTypeStrings, variant: Variant): DriverValue {
  // a tag stores a scalar base type, so an array or matrix has no way to be
  // represented and is dropped rather than partially decoded
  if (variant.arrayType !== VariantArrayType.Scalar) {
    throw Error(
      `[opcuaClientDriver] ${DataType[variant.dataType]} is an array/matrix, which a scalar ${dataType} tag cannot hold`,
    );
  }

  const raw = variant.value;
  const value =
    variant.dataType === DataType.Int64 || variant.dataType === DataType.UInt64
      ? int64ToNumber(raw as [number, number])
      : raw;

  const parsed = Z_BaseTypes[dataType].safeParse(value);
  if (!parsed.success) {
    throw Error(
      `[opcuaClientDriver] ${DataType[variant.dataType]} ${JSON.stringify(raw)} is not a valid ${dataType}: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}
