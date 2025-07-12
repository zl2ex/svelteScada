import { getContext, setContext } from "svelte";
import { io } from "socket.io-client";
import { socketIoEvents } from "$lib/server/socket.io/socket.io";
import { isBaseTagServer } from "../server/baseTag";
import { tagsInit } from "../server/tags";
import { browser } from "$app/environment";

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