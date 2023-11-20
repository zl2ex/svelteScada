

export type BaseTag<T> = {
    name: string;
    data: T;
    enabled: boolean;
};



// WIP vvvvv
import type { Socket } from "socket.io";

class BaseTag_c<T> {
    
    constructor(
        private socketIO: Socket,
        public name: string,
        public data: T,
        public enabled: boolean
    ){};
};

class BaseTagServer<T> implements BaseTag_c<T> {
  
    constructor(
        private socketIO: Socket,
        public name: string,
        public data: T,
        public enabled: boolean
    )
    {
        super(socketIO, name, data, enabled);
    };

    set data(data: T) {
        if(data == this.data) return;// nothing changed
        
        //WIP  update connected clients via socket io
        this.socketIO.to(this.name).emit("tag:update", this);

        this.data = data;
    }
};



class BaseTagClient<T> {

};

