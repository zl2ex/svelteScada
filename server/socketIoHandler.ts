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
    
    
        this._tags = getSetIfy(tagsInit, "tags",
            (path: string, value: any) => {
                return value;
            },
            (path: string, value: any, newValue: any) => {
                console.log('setting', path, newValue);
                value = newValue;
                io.emit(`${path}:update`, value);
                return value;
            },
            () => {}
        );

        io.on("connection", (socket) => {
    
            console.log("socket connected  id " + socket.id);
            
            socket.on("disconnect", () => {
                console.log("socket disconnected  id " + socket.id);
            });

            getSetIfy(this._tags, "tags",
                () => {},
                () => {},
                (path: string, value: any) => {
                    socket.on(`${path}:update`, (newValue) => {
                        socket.broadcast.emit(`${path}:update`, newValue);
                        console.log(`${path}:update`, newValue);
                        value = newValue;
                    });
            });
        });
        
        console.log('SocketIO Tag server running  Tags\n', this._tags);
    }
}