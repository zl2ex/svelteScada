import { Server as SocketIOServer } from "socket.io";
import { type Server } from "http";
import { logger } from "../pino/logger";
import {
  getAllDataTypeStrings,
  Tag,
  TagError,
  type TagOptionsInput,
  type TagPaths,
} from "../tag/tag";
import { tagManager } from "../../../server";
import type { Node } from "../../client/tag/clientTag.svelte";
import { attempt, type Result } from "../../../lib/util/attempt";
import { string } from "zod";

// emits the whole tag object
export type EmitPayload = {
  path: TagPaths;
  value: Pick<
    Tag<any>,
    "path" | "name" | "options" | "parameters" | "value"
  > & {
    statusCodeString: string;
    errorMessage?: string;
    children?: EmitPayload[];
  };
};

/*
Omit<
    Tag<any> & { statusCodeString: string },
    | "ocpuaServer"
    | "opcuaDataType"
    | "isArray"
    | "arrayLength"
    | "schema"
    | "exposeOpcuaVarible"
    | "driverOpcuaVarible"
    | "children"
    | "opcuaParent"
    | "udtParent"
    | "update"
    | "subscribeToDriver"
    | "unsubscribeToDriver"
    | "triggerEmit"
    | "getEmitPayload"
    | "dispose"
    | "statusCode"
    | "[Symbol.dispose]"
  >;
  */

// write just to the value property of the tag
export type WritePayload = {
  path: TagPaths;
  value: any;
};
export interface RpcMap {
  "getDataTypeStrings()": {
    parameters?: {};
    response: Result<string[], Error>;
  };
  "getChildrenAsNode()": {
    parameters: { path: string };
    response: Result<Node[], Error>;
  };
  "createTag()": {
    parameters: { options: TagOptionsInput<any> };
    response: Result<Tag<any>, Error>;
  };
  "updateTag()": {
    parameters: { path: string; options: TagOptionsInput<any> };
    response: Result<Tag<any> | null, Error>;
  };
}

export type RpcName = keyof RpcMap;

export type RpcRequest<K extends keyof RpcMap = keyof RpcMap> = {
  [P in K]: {
    name: P;
    parameters: RpcMap[P]["parameters"];
  };
}[K];

export type RpcResponse<K extends RpcName> = RpcMap[K]["response"];

export interface SocketIOServerToClientEvents {
  "tag:update": (payload: EmitPayload) => void;
}
export interface SocketIOClientToServerEvents {
  "tag:write": (
    payload: WritePayload,
    callback: (payload: Result<EmitPayload, Error | unknown>) => void
  ) => void;
  "tag:subscribe": (
    path: TagPaths,
    callback: (payload: Result<EmitPayload, Error | unknown>) => void
  ) => void;
  "tag:unsubscribe": (path: TagPaths) => void;

  rpc: (
    request: RpcRequest<RpcName>,
    callback: (response: RpcResponse<RpcName>) => void
  ) => void;
}

let io: SocketIOServer<
  SocketIOClientToServerEvents,
  SocketIOServerToClientEvents
>;

const socketClientSubscriptions = new Map<string, Map<string, number>>();

export function emitToSubscribers(payload: EmitPayload) {
  for (const [socketId, subs] of socketClientSubscriptions.entries()) {
    const subCount = subs.get(payload.path);
    if (subCount) {
      io.to(socketId).emit("tag:update", payload);
    }
  }
}

export function creatSocketIoServer(httpServer: Server) {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: ["http://localhost"],
    },
  });

  io.on("connection", (socket) => {
    logger.info(
      `[Socket.io] socket.io client connected with id of ${socket.id}`
    );

    socketClientSubscriptions.set(socket.id, new Map());

    socket.on("tag:subscribe", (path, callback) => {
      const subs = socketClientSubscriptions.get(socket.id);
      let result = attempt(() => {
        if (!subs) {
          throw new TagError(
            "",
            `[Socket.io] subscribe() failed, no client found`
          );
        } else {
          if (!tagManager.getTag(path)) {
            throw new TagError(
              "",
              `[Socket.io] subscribe failed no tag exists at ${path}`
            );
          }

          let currentSubsCount = subs.get(path)?.valueOf() ?? 0;
          currentSubsCount++;
          subs.set(path, currentSubsCount);
          logger.info(
            `[Socket.io] client ${socket.id} subscribed to: ${path} count: ${currentSubsCount}`
          );
          return tagManager.getTag(path)?.getEmitPayload();
        }
      });

      if ("error" in result) {
        logger.error(result.error);
      }

      callback(result);
    });

    socket.on("tag:unsubscribe", (path) => {
      let subs = socketClientSubscriptions.get(socket.id);
      if (subs) {
        let currentSubsCount = subs.get(path)?.valueOf() ?? 1;
        if (currentSubsCount > 0) currentSubsCount--;
        if (currentSubsCount <= 0) {
          subs.delete(path);
        }

        subs.set(path, currentSubsCount);
        logger.info(
          `[Socket.io] client ${socket.id} unsubscribed from: ${path} count: ${currentSubsCount}`
        );
      }
    });

    socket.on("tag:write", ({ path, value }, callback) => {
      callback(
        attempt(() => {
          const tag = tagManager.getTag(path);
          if (!tag) {
            throw new Error(
              `[Socket.io] tag write failed, tag ${path} does not exist`
            );
          }

          tag.update(value);
          logger.info(
            `[Socket.io] client ${socket.id} wrote to tag ${path} = ${value}`
          );
          return tag.getEmitPayload();
        })
      );
    });

    socket.on("rpc", async (request, callback) => {
      logger.debug(
        `[Socket.io] rpc() client ${socket.id} requested ${request.name} Params ${request.parameters}`
      );
      if (request.name === "getChildrenAsNode()") {
        callback(
          attempt(() => tagManager.getChildrenAsNode(request.parameters.path))
        );
      } else if (request.name === "getDataTypeStrings()") {
        callback(await attempt(() => getAllDataTypeStrings()));
      } else if (request.name === "createTag()") {
        callback(
          await attempt(() => tagManager.createTag(request.parameters.options))
        );
      } else if (request.name === "updateTag()") {
        callback(
          await attempt(() =>
            tagManager.updateTag(
              request.parameters.path,
              request.parameters.options
            )
          )
        );
      }
    });

    socket.on("disconnect", () => {
      socketClientSubscriptions.delete(socket.id);
      logger.info(`[Socket.io] Client ${socket.id} disconnected`);
    });
  });

  return io;
}
