import { io } from "socket.io-client";
//import { type DataType } from "node-opcua";
import { type Socket } from "socket.io-client";
import type {
  EmitPayload,
  SocketIOClientToServerEvents,
  SocketIOServerToClientEvents,
} from "$lib/server/socket.io/socket.io";
import { ClientTag } from "../tag/tagState.svelte";
import type { TagTypeMapDefinition } from "$lib/server/tag/tag";

//export class ClientTag<DataTypeString extends BaseTypeStringsWithArrays> {
export class SocketIoClientHandler {
  private socket: Socket<
    SocketIOServerToClientEvents,
    SocketIOClientToServerEvents
  > = io();

  constructor() {
    this.socket.on("connect", () => {
      console.log("[Socket.ioClientHandler] connected to server");
    });

    this.socket.on("tag:update", ({ path, value }) => {
      ClientTag.tags[path]?.update({ path, value });
    });
  }

  get connected() {
    return this.socket.connected;
  }

  tagWrite({ path, value }: EmitPayload) {
    let errorMessage: string | undefined = undefined;
    this.socket.emit("tag:write", { path, value }, (error) => {
      errorMessage = error.message;
    });
    return errorMessage;
  }

  tagSubscribe(path: keyof TagTypeMapDefinition) {
    this.socket.emit("tag:subscribe", path);
  }

  tagUnsubscribe(path: keyof TagTypeMapDefinition) {
    this.socket.emit("tag:unsubscribe", path);
  }
}

export const socketIoClientHandler = new SocketIoClientHandler();
