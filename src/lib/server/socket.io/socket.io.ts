import { Server as SocketIOServer } from "socket.io";
import { type Server } from "http";
import { logger } from "../../pino/logger";

import { tags } from "../opcua/opcuaServer";

let io: SocketIOServer;

const socketClientSubscriptions = new Map<string, Set<string>>();

export function emitToSubscribers(nodeId: string, value: any) {
  for (const [socketId, subs] of socketClientSubscriptions.entries()) {
    if (subs.has(nodeId)) {
        io.to(socketId).emit("tag:update", { nodeId, value });
    }
  }
}

export function creatSocketIoServer(httpServer: Server): SocketIOServer {
    io = new SocketIOServer(httpServer, {
        cors: {
            origin: ["http://localhost"] 
        }});

    io.on("connection", (socket) => {
        logger.info("socket.io client connected with id of " + socket.id);

        socketClientSubscriptions.set(socket.id, new Set());

        socket.on("tag:subscribe", (nodeIds: string[]) => {
            const subs = socketClientSubscriptions.get(socket.id);
            if (subs) {
                subs.clear();
                nodeIds.forEach((id) => {
                    subs.add(id);
                    tags[id].triggerEmit(); // sends a tag:update message to browser as soon as they subscribe so they get the value
                });
                logger.info("socket io client " + socket.id +  " subscribed to: " + nodeIds);
            }
            
        });

        socket.on("tag:unsubscribe", (nodeIds: string[]) => {
            const subs = socketClientSubscriptions.get(socket.id);
                if (subs) {
                nodeIds.forEach(name => subs.delete(name));
                logger.info("socket io client " + socket.id +  " unsubscribed from: " + nodeIds);
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