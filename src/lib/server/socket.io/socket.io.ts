import { Server as SocketIOServer } from "socket.io";
import { type Server } from "http";
import { logger } from "../pino/logger";
import { Tag, TagError, type TagPaths } from "../tag/tag";
import { tagManager } from "../../../server";
import type { Node } from "../../../lib/client/tag/tagState.svelte";
import { attempt, type Result } from "../../../lib/util/attempt";

// emits the whole tag object
export type EmitPayload = {
  path: TagPaths;
  value: Omit<
    Tag<any>,
    | "opcuaDataType"
    | "isArray"
    | "arrayLength"
    | "schema"
    | "exposeOverOpcua"
    | "variable"
    | "opcuaVarible"
    | "children"
    | "opcuaParent"
    | "parameters"
    | "update"
    | "subscribeByPath"
    | "unsubscribeByPath"
    | "triggerEmit"
    | "getEmitPayload"
  >;
};

// write just to the value property of the tag
export type WritePayload = {
  path: TagPaths;
  value: any;
};

export type ErrorPayload = {
  message: string;
};

export interface SocketIOServerToClientEvents {
  "tag:update": (payload: EmitPayload) => void;
  "tag:subscribe": (path: TagPaths) => void;
  "tag:unsubscribe": (path: TagPaths) => void;
}

export interface SocketIOClientToServerEvents {
  "tag:update": (payload: EmitPayload) => void;
  "tag:write": (
    payload: WritePayload,
    callback: (error: ErrorPayload) => void
  ) => void;
  "tag:subscribe": (
    path: TagPaths,
    callback: (payload: Result<EmitPayload, Error | unknown>) => void
  ) => void;
  "tag:unsubscribe": (path: TagPaths) => void;
  "tag:getChildrenAsNode": (
    path: string,
    callback: (items: Node[]) => void
  ) => void;
}

let io: SocketIOServer<
  SocketIOClientToServerEvents,
  SocketIOServerToClientEvents
>;

const socketClientSubscriptions = new Map<string, Set<string>>();

export function emitToSubscribers(payload: EmitPayload) {
  for (const [socketId, subs] of socketClientSubscriptions.entries()) {
    if (subs.has(payload.path)) {
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

    socketClientSubscriptions.set(socket.id, new Set());

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

          subs.add(path);
          logger.info(`[Socket.io] client ${socket.id} subscribed to: ${path}`);
          return tagManager.getTag(path)?.getEmitPayload();
        }
      });

      if (result.error instanceof TagError) {
        logger.error(result.error);
      }

      callback(result);
    });

    socket.on("tag:unsubscribe", (path) => {
      logger.info(`[Socket.io] client ${socket.id} unsubscribed from: ${path}`);
      const subs = socketClientSubscriptions.get(socket.id);
      if (subs) {
        subs.delete(path);
        logger.info(
          `[Socket.io] client ${socket.id} unsubscribed from: ${path}`
        );
      }
      // TD WIP Maybe point triggerEmit() to void ?
    });

    socket.on("tag:write", ({ path, value }, callback) => {
      let error: unknown | undefined = undefined;
      try {
        if (!tagManager.getTag(path)) {
          throw new Error(
            `[Socket.io] tag write failed, tag ${path} does not exist`
          );
        }

        tagManager.getTag(path)?.update(value);
        logger.info(
          `[Socket.io] client ${socket.id} wrote to tag ${path} = ${value}`
        );
      } catch (e) {
        error = e;
        logger.error(`[Socket.io] tag:write failed with Error ${e.message}`);
      }
      callback({
        message: error?.message,
      });
    });

    socket.on("tag:getChildrenAsNode", (path, callback) => {
      logger.debug(
        `[Socket.io] client ${socket.id} requested tag:getChildrenAsNode ${path}`
      );
      callback(tagManager.getChildrenAsNode(path));
    });

    socket.on("disconnect", () => {
      socketClientSubscriptions.delete(socket.id);
      logger.info(`[Socket.io] Client ${socket.id} disconnected`);
    });
  });

  return io;
}
