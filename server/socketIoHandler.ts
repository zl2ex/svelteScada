import { Server } from 'socket.io';
import { tagsInit, type Tags } from '../src/lib/tag/tags';

let tagsServer: Tags = tagsInit; // copy over from init state

export function tagsServerRef(): Tags
{
    console.log("tagServerRef ", tagsServer);
    return tagsServer;
}

export default function injectSocketIO(server) {
    const io = new Server(server, {
        cors: {
            origin: "http://localhost:4173"
        }
    });

    setInterval(logger, 1000);

    function socketIoIfy(obj: any, topic: string) 
    {
        if(Array.isArray(obj)) 
        {
            let items; // TODO FIX ARRAY NOT WORKING
            for (let i = 0; i < obj.length; i++) 
            {
                socketIoIfy(items[i], `${topic}[${i}]`);
            }
            return items;
        } 
        else if(typeof obj === 'object')
        {
            let output = {};
            for(let key in obj) 
            {
                if(typeof obj[key] === 'object') 
                {
                    obj[key] = socketIoIfy(obj[key], `${topic}.${key}`);
                }
                //console.log(`define properties`, topic, key);
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


    

    socketIoIfy(tagsServer, "tags");
       
    io.on("connection", (socket) => {

        console.log("socket connected  id " + socket.id);
        
        socket.on("disconnect", () => {
            console.log("socket disconnected  id " + socket.id);
        });

        registerUpdateEvents(tagsServer, "tags");

        function registerUpdateEvents(obj: any, topic: string) 
        {
            if(Array.isArray(obj)) 
            {
                let items; // TODO FIX ARRAY NOT WORKING
                for (let i = 0; i < obj.length; i++) 
                {
                    registerUpdateEvents(items[i], `${topic}[${i}]`);
                }
                return items;
            } 
            else if(typeof obj === 'object')
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
            return obj;
        }
    });
    
    console.log('SocketIO Tag server running');
}



function logger() 
{
    tagsServer.aprt01.data.value = !tagsServer.aprt01.data.value;
    console.log(tagsServer.attx01.data.value);
}