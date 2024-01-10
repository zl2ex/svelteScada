import { Server } from 'socket.io';
import { tagsInit, type Tags } from '../src/lib/tag/tags';
import { getSetIfy } from '../src/lib/tag/getSetIfy';

function log()
{
    console.log(server.tags.attx01.data.value);
}

console.log("set Inertvil");
//setInterval(log, 1000);

export var server = {
    _tags: tagsInit as Tags,
    get tags() { return this._tags },
    set tags(v) { this._tags = v },


    injectSocketIO: function (server) {
        const io = new Server(server, {
            cors: {
                origin: "http://localhost"
            }
        });
    
    
        /*this._tags = getSetIfy({
            obj: tagsInit,
            path: "tags",
            getCb: (path: string, value: any) => {
                return value;
            },
            setCb: (path: string, value: any, newValue: any) => {
                console.log('setting', path, newValue);
                value = newValue;
                io.emit(`${path}:update`, value);
                return value;
            }
        });*/

        function socketIoIfy(obj: any, path: string): any
        {
            if(typeof obj === 'object')
            {
                let output = {};
                for(let key in obj) 
                {
                    let path_key = `${path}.${key}`;
                    if(typeof obj[key] === 'object') 
                    {
                        obj[key] = socketIoIfy(obj[key], path_key);
                    }
                    console.log(`define properties ${path_key}`);
                    Object.defineProperty(output, key, {
                        get() { return obj[key]; },
                        set(newVal)
                        {
                            console.log('setting', path, newVal);
                            io.emit(`${path}:update`, newVal);
                            obj[key] = newVal;
                        },
                        enumerable: true
                    });
                }
                return output;
            } 
            else
            {
                console.error("please provide an object    this is not an object :", obj);
                return obj;
            }
        }

        this._tags = socketIoIfy(tagsInit, "tags");


        io.on("connection", (socket) => {
    
            console.log("socket connected  id " + socket.id);
            
            socket.on("disconnect", () => {
                console.log("socket disconnected  id " + socket.id);
            });

            function registerUpdateEvents(obj: any, path: string): any
            {
                if(typeof obj === 'object')
                {
                    for(let key in obj) 
                    {
                        let path_key = `${path}.${key}`;
                        if(typeof obj[key] === 'object') 
                        {
                            registerUpdateEvents(obj[key], path_key);
                        }
                        console.log(`register update events ${path_key}`);
                        
                        socket.on(`${path}:update`, (value) => {
                            socket.broadcast.emit(`${path}:update`, value);
                            console.log(`${path}:update`, value);
                            obj[key] = value;
                        });
                    }
                } 
                else
                {
                    console.error("please provide an object    this is not an object :", obj);
                }
            }

            registerUpdateEvents(this._tags, "tags");

            /*getSetIfy({
                obj: this._tags, 
                path: "tags",
                initCb: (path: string, value: any) => {
                    socket.on(`${path}:update`, (newValue) => {
                        socket.broadcast.emit(`${path}:update`, newValue);
                        console.log(`${path}:update`, newValue);
                        value = newValue;
                    });
            }});*/
        });
        
        console.log('SocketIO Tag server running  Tags\n', this._tags);
    }
}