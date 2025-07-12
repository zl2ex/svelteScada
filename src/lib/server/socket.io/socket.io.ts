import { Server as SocketIOServer } from "socket.io";
import { type Server } from "http";
import { logger } from "../../pino/logger";

import { tags } from "../opcua/opcuaServer";

let io: SocketIOServer;

const socketClientSubscriptions = new Map<string, Set<string>>();

export function emitToSubscribers(tagName: string, value: any) {
  for (const [socketId, subs] of socketClientSubscriptions.entries()) {
    if (subs.has(tagName)) {
      io.to(socketId).emit("tag:update", { name: tagName, value });
    }
  }
}

export function creatSocketIoServer(httpServer: Server): SocketIOServer {
    io = new SocketIOServer(httpServer, {
        cors: {
            origin: ["http://localhost"] 
        }});

    io.on("connection", (socket) => {
        logger.info("socket io client connected with id of " + socket.id);

        socketClientSubscriptions.set(socket.id, new Set());

        socket.on("subscribe", (tagNames: string[]) => {
            const subs = socketClientSubscriptions.get(socket.id);
            if (subs) {
            subs.clear();
            tagNames.forEach(name => subs.add(name));
            logger.info(socket.id +  "subscribed to: " + tagNames);
            }
        });

        socket.on("unsubscribe", (tagNames: string[]) => {
            const subs = socketClientSubscriptions.get(socket.id);
            if (subs) {
            tagNames.forEach(name => subs.delete(name));
            logger.info(socket.id +  "unsubscribed from: " + tagNames);
            }
        });

        socket.on("tag:write", ({ nodeId, value }) => {
            logger.debug("socket.io client " + socket.id + " wrote to tag " + nodeId + " = " + value);
            if (tags[nodeId]) {
                tags[nodeId].update(value);
            }
        });

        socket.on("disconnect", () => {
            socketClientSubscriptions.delete(socket.id);
            logger.debug("Socket.io Client Disconnected: ", socket.id);
        });

        
    })

    return io;

}