/*import { Server } from 'socket.io';
import { tagsInit } from '../src/lib/tag/server/tags';
import { socketIoEvents } from '../src/lib/socket.io/socket.ioEvents';
import { isBaseTagServer } from '../src/lib/tag/server/baseTag';
import type { Socket } from 'socket.io-client';
import { OpcuaClient } from '../src/lib/opcua/opcuaClient';

export let server = {

    opcua: new OpcuaClient("opc.tcp://opcuaserver.com:48010"),
    io: new Server,
    tags: tagsInit,

    setupSocketIo: (tgs: object, path: string, skt: Socket) => {
        if(typeof tgs === 'object')
        {
            for(let key in tgs)
            {
                let path_key = `${path}.${key}`;
                // if it is an object but not a tag go one level deeper
                if(typeof tgs[key] === 'object' && isBaseTagServer(tgs[key]) == false)
                {
                    tgs[key] = this.setupSocketIo(tgs[key], path_key);
                }
                console.log(`register updater ${path_key}`);
                
                skt.on(`${socketIoEvents.setTag}:${path_key}`, (data) => {
                    console.log(key, path_key, data);
                    //console.log(this.tags);
                    //this.tags[key] = data;
                });
            }
        }
        else
        {
            console.error("please provide an object    this is not an object :", tgs);
        }
    },

    injectSocketIO(server: any) {

        this.opcua.start();
        
        this.io = new Server(server, {
            cors: {
                origin: "http://localhost"
            }
        });
    
        /*function socketIoIfy(obj: any, topic: string)


        {
            if(typeof obj === 'object')
            {
                let output = {};
                for(let key in obj)
                {
                    if(typeof obj[key] === 'object') 
                    {
                        obj[key] = socketIoIfy(obj[key], `${topic}.${key}`);
                    }
                    //console.log(`define properties ${topic}.${key}`);
                    Object.defineProperty(output, key, {
                        get() { return obj[key]; },
                        set(val)
                        {
                            console.log('setting', key, val);
                            io.emit(`${topic}.${key}:update`, val);
                            obj[key] = val;
                        },
                        enumerable: true
                    });
                }
                return output;
            } 
            else return obj;
        }
    
        this._tags = socketIoIfy(tagsInit, "tags");
        */

/*
        
        
        this.io.on("connection", (socket) => {
    
            console.log("socket connected  id " + socket.id);
            
            socket.on("disconnect", () => {
                console.log("socket disconnected  id " + socket.id);
            });

            socket.on(socketIoEvents.getAllTags, () => {
                socket.emit(socketIoEvents.setAllTags, this.tags);
            });

            this.setupSocketIo(this.tags, "tags", socket);
        });

        console.log(this.tags.aprt01.data);
    }
}
*/