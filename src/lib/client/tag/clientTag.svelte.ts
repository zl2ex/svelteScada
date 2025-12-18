import type {
  EmitPayload,
  SocketIOClientToServerEvents,
  SocketIOServerToClientEvents,
} from "$lib/server/socket.io/socket.io";
import type {
  ResolveType,
  TagOptionsInput,
  TagPaths,
} from "$lib/server/tag/tag";
import type { Result } from "$lib/util/attempt";
import type { Socket } from "socket.io-client";
import z from "zod";

export const Z_NodeOptions = z.object({
  name: z.string(),
  parentPath: z.string(),
  type: z.union([z.literal("Tag"), z.literal("UdtTag"), z.literal("Folder")]),
});

export type NodeOptions = z.input<typeof Z_NodeOptions>;

export class Node {
  path: string;
  name: string;
  parentPath: string;
  type: NodeOptions["type"];
  constructor(options: NodeOptions) {
    const opts = Z_NodeOptions.parse(options);
    this.type = opts.type;
    this.name = opts.name;

    /*if (this.type == "UdtTag") {
      this.parentPath = opts.parentPath + ".";
    } else if (
      opts.parentPath.endsWith("/") == false &&
      opts.parentPath.length > 1
    ) {
      this.parentPath = opts.parentPath + "/";
    } else {*/
    this.parentPath = opts.parentPath;
    //}
    let path = `${this.parentPath}${this.name}`;

    if (this.type == "Folder" && path.endsWith("/") == false) {
      path = path + "/";
    }

    this.path = path;
  }
}

type EventMap = Record<string, Event>;

export class TypedEventTarget<T extends EventMap> {
  private target = new EventTarget();

  addEventListener<K extends keyof T>(
    type: K,
    listener: (ev: T[K]) => void,
    options?: boolean | AddEventListenerOptions
  ): void {
    this.target.addEventListener(
      type as string,
      listener as EventListener,
      options
    );
  }

  removeEventListener<K extends keyof T>(
    type: K,
    listener: (ev: T[K]) => void,
    options?: boolean | EventListenerOptions
  ): void {
    this.target.removeEventListener(
      type as string,
      listener as EventListener,
      options
    );
  }

  dispatchEvent<K extends keyof T>(event: T[K]): boolean {
    return this.target.dispatchEvent(event);
  }
}

type TagEvents = {
  "tag:update:": CustomEvent<EmitPayload>;
};

export type ClientTagOptions = {
  path: TagPaths;
  name?: string;
  parentPath?: string;
  initialValue?: any;
};

export type ClientDataTypeStrings = "number" | "boolean" | "string" | "any";

//export class ClientTag<DataTypeString extends BaseTypeStringsWithArrays> {
export class ClientTag<DataTypeString extends ClientDataTypeStrings> {
  private static socket?: Socket<
    SocketIOServerToClientEvents,
    SocketIOClientToServerEvents
  >;
  //static tags: Record<TagPaths, ClientTag<any>> = []; // TD WIP REMOVE ??
  static events = new TypedEventTarget<TagEvents>();
  private _value: ResolveType<DataTypeString>;
  private expectedDataType: ClientDataTypeStrings;
  path: TagPaths;
  options: TagOptionsInput<any>;
  statusCodeString: string;
  children?: Map<string, ClientTag<any>>;
  errorMessage?: string;

  static initSocketIo(clientSocket: Socket) {
    ClientTag.socket = clientSocket;
    ClientTag.socket.on("tag:update", (payload) => {
      //ClientTag.tags[path]?.update({ path, value });
      console.debug(
        `tag.update:${payload.path} = ${payload.value.value} ${payload.value.statusCodeString}`
      );
      ClientTag.events.dispatchEvent(
        new CustomEvent(`tag:update:${payload.path}`, { detail: payload })
      );
    });
  }

  constructor(expectedDataType: DataTypeString, opts: ClientTagOptions) {
    if (!ClientTag.socket) {
      throw new Error(
        `[ClientTag] Socket.io client not initalised  Call initSocketIo() before creating any instances`
      );
    }

    this.path = opts.path;
    this.expectedDataType = expectedDataType;
    this.options = $state({
      name: opts.name ?? "",
      parentPath: opts.parentPath ?? "",
      dataType: expectedDataType,
      writeable: false,
      parameters: undefined,
      exposeOverOpcua: false,
    });

    this._value = $state(opts.initialValue ?? null);
    this.statusCodeString = $state("UncertainInitalValue");
    this.errorMessage = $state(undefined);
    this.children = $state(new Map());

    //ClientTag.tags[this.path] = this;

    ClientTag.events.addEventListener(`tag:update:${this.path}`, this.update);

    console.log(`[ClientTag] created tag ${this.path}`);
  }

  [Symbol.dispose]() {
    this.dispose();
  }

  dispose() {
    this.unsubscribe();
    ClientTag.events.removeEventListener(
      `tag:update:${this.path}`,
      this.update
    );
    console.trace(`[ClientTag] dispose() ${this.path}`);
    //delete ClientTag.tags[this.path];
  }

  private update = (e: CustomEvent<EmitPayload>) => {
    const path = e.detail.path;
    const payload = e.detail.value;

    if (path != this.path)
      throw new Error(
        `[Client Tag]  tag:update  path ${path} does not match requested path ${this.path}`
      );

    // TD WIP Validate datatype of tag vs datatype of clientTag
    /*if (this.expectedDataType !== payload.dataType)
      throw new Error(
        `[Client Tag] tag:update   dataType ${payload.dataType} is not assignable to ${this.expectedDataType}`
      );
*/
    this.options = payload.options;
    this._value = payload.value;
    this.statusCodeString = payload.statusCodeString;
    this.errorMessage = payload.errorMessage;
    if (payload.children) {
      payload.children.forEach((child) => {
        this.children?.set(child.path, new ClientTag("any", child));
      });
    }
  };

  get value() {
    return this._value;
  }

  set value(newValue: any) {
    this.write(newValue);
  }

  async write(value: ResolveType<DataTypeString>) {
    if (!ClientTag.socket) {
      throw new Error(
        `[ClientTag] Socket.io client not initalised  Call initSocketIo() before calling write()`
      );
    }

    // only update on change
    if (value == this._value) return;

    return new Promise((resolve, reject) => {
      ClientTag.socket?.emit(
        "tag:write",
        { path: this.path, value },
        (response) => {
          if ("error" in response) {
            console.error(response.error.message);
            this.errorMessage = response.error.message;
            reject({ data: undefined, error: response.error });
          } else {
            // populate the tag with all the data returned
            this.update({ detail: response.data });
            this.errorMessage = undefined;
            resolve({ data: this, error: undefined });
          }
        }
      );
    });
  }

  async subscribe(): Promise<Result<ClientTag<any>, Error>> {
    if (!ClientTag.socket) {
      throw new Error(
        `[ClientTag] Socket.io client not initalised  Call initSocketIo() before calling subscribe()`
      );
    }
    //ClientTag.socket.emit("tag:subscribe", this.path);
    console.debug(`[ClientTag] attempt to subscribe tag ${this.path}`);

    return new Promise((resolve, reject) => {
      ClientTag.socket?.emit("tag:subscribe", this.path, (response) => {
        if ("error" in response) {
          console.error(response.error.message);
          this.errorMessage = response.error.message;
          reject({ data: undefined, error: response.error });
        } else {
          // populate the tag with all the data returned
          this.update({ detail: response.data });
          resolve({ data: this, error: undefined });
        }
      });
    });
  }

  unsubscribe() {
    if (!ClientTag.socket) {
      throw new Error(
        `[ClientTag] Socket.io client not initalised  Call initSocketIo() before calling unsubscribe()`
      );
    }
    ClientTag.socket.emit("tag:unsubscribe", this.path);
    console.log(`[ClientTag] un-subscribe tag ${this.path}`);
  }
}
