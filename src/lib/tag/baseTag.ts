import type { ViteDevServer } from 'vite';
import { Server } from 'socket.io';
import type { Socket } from 'socket.io';


export type BaseTag<T> = {
    name: string;
    data: T;
    enabled: boolean;
};




// WIP vvvvv

class BaseTag_c<T> {
    
    constructor(
        protected _name: string,
        protected _data: T,
        protected _enabled: boolean
    ){};
};

export class BaseTagServer<T> extends BaseTag_c<T> 
{

    //private _socket: Socket;

    constructor(args: {
        name: string,
        data: T,
        enabled: boolean
    })
    {
        super(args.name, args.data, args.enabled);
        //this._socket = undefined;
    }


    /*static socketIO: Server;

    static socketIoInit(server:ViteDevServer)
    {
        console.log("static");



        BaseTagServer.socketIO = new Server(server.httpServer);

        BaseTagServer.socketIO.on("connection", (socket) => {

            this._socket = socket;

			console.log("socket connected  id " + socket.id);
			
			socket.on("disconnect", () => {
				console.log("socket disconnected  id " + socket.id);
			});
            /*
            socket.on("tag:update", (data) => {
                this.setData(data);
            });
    
            socket.on("tag:read", (data) => {
                console.log(data);
            });
    
            socket.on("tag:subscribe", (name: string) => {
               
                console.log("tag:subscribe " + name);
            });
    
            socket.on("tag:unsubscribe", (name: string) => {
                
                console.log("tag:unsubscribe " + name);
            });
            
        });
    };*/

    private setData(data: T) 
    {
        
    }



    public set data(data: T)
    {
        //if(data == this._data) return;// nothing changed
        console.log("set data");
        console.log(data);
        //WIP  update connected clients via socket io
        io.to(this._name).emit("tag:update", this);

        this._data = data;
    }

    public get data()
    {
        return this._data;
    }
};

class BaseTagClient<T> {

};

