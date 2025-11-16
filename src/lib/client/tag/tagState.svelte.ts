import type {
  EmitPayload,
  SocketIOClientToServerEvents,
  SocketIOServerToClientEvents,
} from "$lib/server/socket.io/socket.io";
import type { ResolveType, TagError, TagPaths } from "$lib/server/tag/tag";
import type { UdtParams } from "$lib/server/tag/udt";
import type { Result } from "$lib/util/attempt";
import type { Socket } from "socket.io-client";

export type NodeOptions = {
  path: string;
  name: string;
  parentPath: string;
  type: "Tag" | "Folder";
};
export class Node {
  path: string;
  name: string;
  parentPath: string;
  type: "Tag" | "Folder";
  constructor(opts: NodeOptions) {
    this.path = opts.path;
    this.name = opts.name;
    this.parentPath = opts.parentPath;
    this.type = opts.type;
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

export type ClientDataTypeStrings = "number" | "boolean" | "string";

//export class ClientTag<DataTypeString extends BaseTypeStringsWithArrays> {
export class ClientTag<DataTypeString extends ClientDataTypeStrings> {
  private static socket?: Socket<
    SocketIOServerToClientEvents,
    SocketIOClientToServerEvents
  >;
  //static tags: Record<TagPaths, ClientTag<any>> = []; // TD WIP REMOVE ??
  static events = new TypedEventTarget<TagEvents>();
  private _value: ResolveType<DataTypeString>;
  name?: string;
  path: TagPaths;
  parentPath: string;
  nodeId?: string;
  dataType?: DataTypeString;
  writeable?: boolean;
  parameters?: UdtParams;
  exposeOverOpcua?: boolean;
  valueStatus: string;
  errorMessage?: string;
  error?: TagError;

  static initSocketIo(clientSocket: Socket) {
    ClientTag.socket = clientSocket;
    ClientTag.socket.on("tag:update", (payload) => {
      //ClientTag.tags[path]?.update({ path, value });
      console.log(
        `tag.update:${payload.path} = ${payload.value.value} ${payload.value.valueStatus}`
      );
      ClientTag.events.dispatchEvent(
        new CustomEvent(`tag:update:${payload.path}`, { detail: payload })
      );
    });
  }

  constructor(dataType: DataTypeString, opts: ClientTagOptions) {
    if (!ClientTag.socket) {
      throw new Error(
        `[ClientTag] Socket.io client not initalised  Call initSocketIo() before creating any instances`
      );
    }
    this.name = $state(opts.name ?? "");
    this.path = $state(opts.path);
    this.parentPath = $state(opts.parentPath ?? "");
    this.dataType = $state(dataType);
    this.writeable = $state(false);
    this.parameters = $state(undefined);
    this.exposeOverOpcua = $state(false);
    this._value = $state(opts.initialValue ?? null);
    this.valueStatus = $state("UncertainInitalValue");
    this.errorMessage = $state(undefined);
    this.error = $state(undefined);

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
    console.debug(`[ClientTag] dispose() ${this.path}`);
    //delete ClientTag.tags[this.path];
  }

  private update = (e: CustomEvent<EmitPayload>) => {
    const path = e.detail.path;
    const value = e.detail.value;

    if (path != this.path)
      throw new Error(
        `[Client Tag]  tag:update  path ${path} does not match requested path ${this.path}`
      );

    // TD WIP Validate datatype of tag vs datatype of clientTag
    /*if (this.dataType !== value.dataType)
        throw new Error(
          `[Client Tag] tag:update   dataType ${value.dataType} is not assignable to ${this.dataType}`
        );*/

    this.name = value.name;
    this.path = value.path;
    this.parentPath = value.parentPath;
    this.nodeId = value.nodeId;
    this.dataType = value.dataType;
    this.parameters = value.parameters;
    this.exposeOverOpcua = value.exposeOverOpcua;
    this._value = value.value;
    this.valueStatus = value.valueStatus;
    this.writeable = value.writeable;
    this.error = value.error;
    this.errorMessage = value.error?.message;
    //Object.assign(this, value);
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
    console.log(`[ClientTag] attempt to subscribe tag ${this.path}`);

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

/*
let socket: Socket | undefined;
    socket = io();
    socket.on("tag:update", ( {nodeId, value }) => {
    //tags.update(t => ({ ...t, [tag.name]: tag.value });
        console.log("tag:update " + nodeId + " = " + value);
    });
    socket.on("connect", () => {
        console.log("socketIO Connected");
        socket.emit("tag:write", {nodeId: "Status", value: 25.4});
    });


function writeTag(name: string) {
        const newVal = prompt(`Enter new value for ${name}`);
        if (newVal !== null) {
        socket?.emit("tag:write", { name, value: JSON.parse(newVal) });
    }
}
/*
class BaseTagClient<T> {
    name: string;
    data: T;

    constructor(serverTag: BaseTagServer<T>) {
        this.name = serverTag.name;
        this.data = serverTag.data;
    }
};

function convertAllTagsToClient(serverTags: typeof tagsInit) {
    const keys = tagsect.keys(serverTags);
    let clientTags : any = {};
    keys.forEach((key) => {
        tagsect.defineProperty(clientTags, key, { value: new BaseTagClient(serverTags[key]), enumerable: true } )
    });

    return clientTags;
}*/
/*
export class TagState {
    
    tags : typeof tagsInit = $state(tagsInit);

    _socketIo = io();//io("ws://localhost:3000");

    constructor() {

        if(!browser) return;
        
        this._socketIo.on("connect", () => {
            console.log("socket connected");
            this.getAllTags();
        });

        this._socketIo.on("disconnect", () => {
            console.log("socket disconnected");
        });

        this._socketIo.on(socketIoEvents.setAllTags, (allTags) => {
            
            //this.tags = allTags;
            console.log(socketIoEvents.setAllTags, this.tags);
        });

        this.setupSocketIo(this.tags, "tags");
    }


    setupSocketIo(tags: object, path: string) 
    {
        if(typeof tags === 'object')
        {
            for(let key in tags) 
            {
                let path_key = `${path}.${key}`;
                // if it is an object but not a tag go one level deeper
                if(typeof tags[key] === 'object' && isBaseTagServer(tags[key]) == false)
                {
                    tags[key] = this.setupSocketIo(tags[key], path_key);
                }
                console.log(`register updater ${path_key}`);
                
                this._socketIo.on(`${socketIoEvents.setTag}:${path_key}`, (data) => {
                    console.log(data);
                    tags[key] = data;
                });

                
                tags[key].write = function() {
                    console.log(`${socketIoEvents.setTag}:${path_key}`, tags[key]);
                    this._socketIo.emit(`${socketIoEvents.setTag}:${path_key}`, tags[key]);
                }
            }
        }
        else
        {
            console.error("please provide an object    this is not an object :", tags);
            return tags;
        }
    }


    



    getAllTags() {
        this._socketIo.emit(socketIoEvents.getAllTags);
    }


    /*subscribe(tagName: string) {
        console.log(tagName);
        tagsect.defineProperty(this.tags, tagName, {value: tagsInit[tagName], enumerable: true}) // : typeof tagsInit[tagName]
    }

        // TODO FIX ARRAY's 
        //let test = socketIoIfy([{test: 1, demo: 2, is:false}, {boo: false}])

        /*function socketIoIfy(tags: any, topic: string) 
        {
            if(typeof tags === 'tagsect') 
            {
                let rune = $state(tags);
                let output = {};
                for(let key in rune) 
                {
                    if(typeof tags[key] === 'tagsect') 
                    {
                        tags[key] = socketIoIfy(tags[key], `${topic}.${key}`);
                    }
                    tagsect.defineProperty(output, key, {
                        get() { return rune[key]; },
                        set(val)
                        { 
                            console.log('setting', key, val);
                            socket.emit(`${topic}.${key}:update`, val);
                            rune[key] = val;
                        },
                        enumerable: true
                    });

                    // register socket on update event to get updates
                    socket.on(`${topic}.${key}:update`, (value) => {
                        console.log(`${topic}.${key}:update`, value);
                        rune[key] = value;
                    });
                }
                return output;
            }
            else return tags;
        }
            
}


let TAG_KEY = Symbol("TAG_KEY");

export function setTagState() {
    return setContext(TAG_KEY, new TagState());
}

export function getTagState() {
    return getContext<ReturnType<typeof setTagState>>(TAG_KEY);
}


*/
