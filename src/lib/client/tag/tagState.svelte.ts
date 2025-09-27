import type {
  EmitPayload,
  SocketIOClientToServerEvents,
  SocketIOServerToClientEvents,
} from "$lib/server/socket.io/socket.io";
import type { ResolveType, TagPaths } from "$lib/server/tag/tag";
import type { Socket } from "socket.io-client";

export type ClientTagOptions = {
  path: TagPaths;
  name?: string;
  initialValue?: any;
};

export type ClientDataTypeStrings = "number" | "boolean" | "string";

function waitForSocketResponse(socket: Socket, eventName: string) {
  return new Promise((resolve) => {
    socket.on(eventName, (data) => {
      resolve(data);
    });
  });
}

//export class ClientTag<DataTypeString extends BaseTypeStringsWithArrays> {
export class ClientTag<DataTypeString extends ClientDataTypeStrings> {
  private static socket?: Socket<
    SocketIOServerToClientEvents,
    SocketIOClientToServerEvents
  >;
  static tags: Record<TagPaths, ClientTag<any>> = [];
  name?: string;
  path: TagPaths;
  nodeId?: string;
  dataType?: DataTypeString;
  writeable?: boolean;
  private _value: ResolveType<DataTypeString>;
  errorMessage: string | undefined;

  static initSocketIo(clientSocket: Socket) {
    ClientTag.socket = clientSocket;
    ClientTag.socket.on("tag:update", ({ path, value }) => {
      ClientTag.tags[path]?.update({ path, value });
    });
  }

  static async getTagPathsByPath(path: string): Promise<string[]> {
    if (!ClientTag.socket) {
      throw new Error(
        `[ClientTag] Socket.io client not initalised  Call initSocketIo() before calling subscribe()`
      );
    }
    return new Promise((resolve) => {
      ClientTag.socket?.emit("tag:getTagPathsByPath", path, (paths) => {
        resolve(paths);
      });
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
    this.dataType = $state(dataType);
    this.writeable = $state(false);
    this._value = $state(opts.initialValue ?? null);
    this.errorMessage = $state(undefined);

    ClientTag.tags[this.path] = this;
    console.log(`[ClientTag] created tag ${this.path}`);
  }

  [Symbol.dispose]() {
    this.unsubscribe();
    delete ClientTag.tags[this.path];
  }

  private update({ path, value }: EmitPayload) {
    console.log(value);
    if (path != this.path || value.path != this.path)
      throw new Error(
        `[Client Tag]  tag:update  path ${value.path} does not match requested path ${this.path}`
      );

    // TD WIP Validate datatype of tag vs datatype of clientTag
    /*if (this.dataType !== value.dataType)
        throw new Error(
          `[Client Tag] tag:update   dataType ${value.dataType} is not assignable to ${this.dataType}`
        );*/
    this.name = value.name;
    this.path = value.path;
    this.nodeId = value.nodeId;
    this.dataType = value.dataType;
    this._value = value.value;
    this.writeable = value.writeable;
    //Object.assign(this, value);
  }

  get value() {
    return this._value;
  }

  write(value: ResolveType<DataTypeString>) {
    if (!ClientTag.socket) {
      throw new Error(
        `[ClientTag] Socket.io client not initalised  Call initSocketIo() before calling write()`
      );
    }
    ClientTag.socket.emit("tag:write", { path: this.path, value }, (error) => {
      this.errorMessage = error.message ?? undefined;
    });
  }

  subscribe() {
    if (!ClientTag.socket) {
      throw new Error(
        `[ClientTag] Socket.io client not initalised  Call initSocketIo() before calling subscribe()`
      );
    }
    console.log(`[ClientTag] subscribe tag ${this.path}`);
    ClientTag.socket.emit("tag:subscribe", this.path);
  }

  unsubscribe() {
    if (!ClientTag.socket) {
      throw new Error(
        `[ClientTag] Socket.io client not initalised  Call initSocketIo() before calling unsubscribe()`
      );
    }
    console.log(`[ClientTag] un-subscribe tag ${this.path}`);
    ClientTag.socket.emit("tag:unsubscribe", this.path);
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
