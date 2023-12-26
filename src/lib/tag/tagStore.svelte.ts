import { io } from 'socket.io-client';
import type { Tags } from '$lib/tag/tags';

let _tags= $state<Tags>();

// call this function in any component or page to get tags reference
export function tagsRef():Tags {
    /*
    return {
        get value() { return _tags },
        set value(v) { _tags = v }
    }*/
    if(_tags) return _tags;
    else console.error("Please call socketIoTagsClient() and pass inital value for tags");
}


// pass object to be shared across client and server
export function socketIoTagsClient(initalState: Tags)
{
    console.log("createSocket on Client");
    const socket = io();

    _tags = socketIoIfy(initalState, "tags");

    socket.on("connect", () => {
        console.log("socket connected");
    });

    socket.on("disconnect", () => {
        console.log("socket disconnected");
    });


    // TODO FIX ARRAY's 
    //let test = socketIoIfy([{test: 1, demo: 2, is:false}, {boo: false}])

    function socketIoIfy(obj: any, topic: string) 
    {
        if(Array.isArray(obj)) 
        {
            let items;
            for (let i = 0; i < obj.length; i++) 
            {
                socketIoIfy(items[i], `${topic}[${i}]`);
            }
            return items;
        } 
        else if(typeof obj === 'object') 
        {
            let rune = $state(obj);
            let output = {};
            for(let key in rune) 
            {
                if(typeof obj[key] === 'object') 
                {
                    obj[key] = socketIoIfy(obj[key], `${topic}.${key}`);
                }
                Object.defineProperty(output, key, {
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
        else return obj;
    }
}
