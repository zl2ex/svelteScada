import { io } from "socket.io-client";
//import { type DataType } from "node-opcua";
import { type Socket } from "socket.io-client";
import type {
  RpcName,
  RpcRequest,
  RpcResponse,
  SocketIOClientToServerEvents,
  SocketIOServerToClientEvents,
} from "$lib/server/socket.io/socket.io";

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
        console.debug(response);
        if ("error" in response) {
          reject(response);
          //throw response.payload?.error;
        } else {
          resolve(response);
        }
      });
    });
  }
}

export const socketIoClientHandler = new SocketIoClientHandler();
