import { Server } from 'socket.io';
import { tags } from '../src/lib/tag/tags.ts';
import { BaseTagServer } from '../src/lib/tag/baseTag.ts';


export default function injectSocketIO(server) {
    const io = new Server(server, {
        cors: {
            origin: "http://localhost:4173"
        }
    });


    function onTagRead() 
    {
        console.log("tag:read");
    }


    function onTagUpdate(tag: BaseTagServer<object>)
    {
        io.to(tag.name).emit("tag:update", tag);
    }

    BaseTagServer.socketIoInit(onTagRead, onTagUpdate);

       
    io.on("connection", (socket) => {

        console.log("socket connected  id " + socket.id);
        
        socket.on("disconnect", () => {
            console.log("socket disconnected  id " + socket.id);
        })

        // get a list of tags, same as a GET request basically
        socket.on("tags:read", onTagRead);

        // update tag infomation on server,
        // then emit an event to update tag on subscribed clients
        socket.on("tag:update", (tag:BaseTagServer<object>) => {
            console.log("tags:update " + tag.name);

            // no key of that name in tags
            if((tag.name in tags) == false) 
            {
                console.error(`cant find ${tag.name} in tags object. please check name`);
                return;
            }

            tags[tag.name as keyof typeof tags] = tag;
            console.log(tag);
            io.to(tag.name).emit("tag:update", tag);
        });

        // subscribe to update events on that paticular tag
        socket.on("tags:subscribe", (names: string[]) => {
            for(let name of names)
            {
                // tags object has that paticular tag
                if(name in tags) socket.join(name);
                else console.error(`subscribe to ${name} failed no tag with that name exists`);
            }
            console.log(`tags:subscribe ${names}`);
        });

        socket.on("tags:unsubscribe", (names: string[]) => {
            for(let name of names)
            {
                // tags object has that paticular tag
                if(name in tags) socket.leave(name);
                else console.log(`unsubscribed from ${name} failed no tag with that name exists`);
            }
            console.log("tags:unsubscribe " + names);
        });

    });

    console.log('SocketIO Tag server running');
}