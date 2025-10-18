import { io } from "socket.io-client";
//import { type DataType } from "node-opcua";
import { type Socket } from "socket.io-client";
import type {
  EmitPayload,
  Rpc,
  RpcName,
  RpcRequest,
  RpcResponse,
  SocketIOClientToServerEvents,
  SocketIOServerToClientEvents,
} from "$lib/server/socket.io/socket.io";
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
  }

  get connected() {
    return this.socket.connected;
  }

  async rpc<K extends RpcName>(
    request: RpcRequest<K>
  ): Promise<RpcResponse<K>> {
    return new Promise((resolve, reject) => {
      this.socket.emit("rpc", request, (response) => {
        console.log(response);
        if ("error" in response) {
          reject(response);
          //throw response.payload?.error;
        } else {
          resolve(response);
        }
      });
    });
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
