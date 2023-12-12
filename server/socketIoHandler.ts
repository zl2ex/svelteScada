import { Server } from 'socket.io';
import { tags, type Tags } from '../src/lib/tag/tags';
//import { BaseTagServer } from '../src/lib/tag/baseTag';


let tags_server: Tags;


export default function injectSocketIO(server) {
    const io = new Server(server, {
        cors: {
            origin: "http://localhost:4173"
        }
    });

    setInterval(logger, 1000);

       
    io.on("connection", (socket) => {

        console.log("socket connected  id " + socket.id);

        socketIoIfy(tags, "tags");
        
        socket.on("disconnect", () => {
            console.log("socket disconnected  id " + socket.id);
        });

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
                    Object.defineProperty(output, key, {
                        get() { return obj[key]; },
                        set(val) 
                        { 
                            //console.log('setting', key, val);
                            socket.emit(`${topic}.${key}:update`, val);
                            obj[key] = val;
                        },
                        enumerable: true
                    });

                    // register socket on update event to get updates
                    socket.on(`${topic}.${key}:update`, (value) => {
                        console.log(`${topic}.${key}:update`, value);
                        obj[key] = value;
                    });
                }
                return output;
            } 
            else return obj;
        }
    });

    console.log('SocketIO Tag server running');
}



function logger() 
{
    console.log(tags.aprt01.data.value);
    tags.aprt01.data.value = !tags.aprt01.data.value;

}