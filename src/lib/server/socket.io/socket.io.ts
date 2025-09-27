import { Server as SocketIOServer } from "socket.io";
import { type Server } from "http";
import { logger } from "../pino/logger";
import {
  Tag,
  type ResolveType,
  type TagTypeMapDefinition,
  type TagTypeMap,
  type TagPaths,
} from "../tag/tag";
import { callback } from "chart.js/helpers";

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
    | "parent"
    | "parameters"
    | "update"
    | "subscribeByPath"
    | "unsubscribeByPath"
    | "triggerEmit"
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
  "tag:subscribe": (path: TagPaths) => void;
  "tag:unsubscribe": (path: TagPaths) => void;
  "tag:getTagPathsByPath": (
    path: string,
    callback: (paths: string[]) => void
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

    socket.on("tag:subscribe", (path) => {
      const subs = socketClientSubscriptions.get(socket.id);
      if (subs) {
        if (!Tag.tags.has(path)) {
          logger.error(`[Socket.io] subscribe failed no tag exists at ${path}`);
          return;
        }

        subs.add(path);
        Tag.tags.get(path)?.triggerEmit(); // sends a tag:update message to browser as soon as they subscribe so they get the value
        logger.info(`[Socket.io] client ${socket.id} subscribed to: ${path}`);
      }
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
        if (!Tag.tags.has(path)) {
          throw new Error(
            `[Socket.io] tag write failed, tag ${path} does not exist`
          );
        }

        Tag.tags.get(path)?.update(value);
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

    socket.on("tag:getTagPathsByPath", (path, callback) => {
      logger.debug(
        `[Socket.io] client ${socket.id} requested tag:getTagPathsByPath ${path}`
      );
      callback(Tag.getTagPathsByPath(path));
    });

    socket.on("disconnect", () => {
      socketClientSubscriptions.delete(socket.id);
      logger.info(`[Socket.io] Client ${socket.id} disconnected`);
    });
  });

  return io;
}
