import { Server as SocketIOServer } from "socket.io";
import { type Server } from "http";
import { logger } from "../../pino/logger";
import {
  Tag,
  type ResolveType,
  type TagTypeMapDefinition,
  type TagTypeMap,
  type TagPaths,
} from "../tag/tag";

// emits the whole tag object
export type EmitPayload<P extends keyof TagTypeMap = keyof TagTypeMap> = {
  path: P;
  value: TagTypeMap[P];
};

// write just to the value property of the tag
export type WritePayload<P extends keyof TagTypeMap = keyof TagTypeMap> = {
  path: P;
  value: ResolveType<TagTypeMapDefinition[P]>;
};

let io: SocketIOServer;

const socketClientSubscriptions = new Map<string, Set<string>>();

export function emitToSubscribers(payload: EmitPayload) {
  for (const [socketId, subs] of socketClientSubscriptions.entries()) {
    if (subs.has(payload.path)) {
      io.to(socketId).emit(`tag:update/${payload.path}`, payload);
    }
  }
}

export function creatSocketIoServer(httpServer: Server): SocketIOServer {
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

    socket.on("tag:subscribe", (path: TagPaths) => {
      const subs = socketClientSubscriptions.get(socket.id);
      if (subs) {
        if (!Tag.tags[path]) {
          logger.error(`[Socket.io] no tag exists at ${path}`);
          return;
        }

        subs.add(path);
        Tag.tags[path].triggerEmit(); // sends a tag:update message to browser as soon as they subscribe so they get the value
        logger.info(`[Socket.io] client ${socket.id} subscribed to: ${path}`);
      }
    });

    socket.on("tag:unsubscribe", (path: TagPaths) => {
      const subs = socketClientSubscriptions.get(socket.id);
      if (subs) {
        subs.delete(path);
        logger.info(
          `[Socket.io] client ${socket.id} unsubscribed from: ${path}`
        );
      }
      // TD WIP Maybe point triggerEmit() to void ?
    });

    socket.on("tag:write", ({ path, value }: WritePayload) => {
      if (!Tag.tags[path]) {
        logger.error(
          `[Socket.io] tag write failed, tag ${path} does not exist`
        );
        return;
      }
      Tag.tags[path].update(value);
      logger.info(
        `[Socket.io] client ${socket.id} wrote to tag ${path} = ${value}`
      );
    });

    socket.on("disconnect", () => {
      socketClientSubscriptions.delete(socket.id);
      logger.info(`[Socket.io] Client ${socket.id} disconnected`);
    });
  });

  return io;
}
