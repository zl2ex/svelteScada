import { Server } from 'socket.io';
import { tagsInit, type Tags } from '../src/lib/tag/tags';

function log()
{
    console.log(server.tags.attx01.data.value);
}

console.log("set Inertvil");
setInterval(log, 1000);

export var server = {
    _tags: tagsInit as Tags,
    get tags() { return this._tags },
    set tags(v) { this._tags = v },


    injectSocketIO: function (server) {
        let io;
        if(io) return;
        io = new Server(server, {
            cors: {
                origin: "http://localhost"
            }
        });
    
        
    
        function socketIoIfy(obj: any, topic: string)
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
           
        io.on("connection", (socket) => {
    
            console.log("socket connected  id " + socket.id);
            
            socket.on("disconnect", () => {
                console.log("socket disconnected  id " + socket.id);
            });
    
            registerUpdateEvents(this._tags, "tags");
    
            function registerUpdateEvents(obj: any, topic: string) 
            {
                if(typeof obj === 'object')
                {
                    for(let key in obj)
                    {
                        if(typeof obj[key] === 'object') 
                        {
                            registerUpdateEvents(obj[key], `${topic}.${key}`);
                        }
    
                        //console.log(`register update events ${topic}.${key}`);
                        // register socket on update event to get updates
                        socket.on(`${topic}.${key}:update`, (value) => {
                            socket.broadcast.emit(`${topic}.${key}:update`, value);
                            console.log(`${topic}.${key}:update`, value);
                            obj[key] = value;
                        });
                    }
                }
            }
        });
        
        console.log('SocketIO Tag server running  Tags\n', this._tags);
    }
}