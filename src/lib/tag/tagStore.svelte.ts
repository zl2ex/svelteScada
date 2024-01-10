import { setContext, getContext } from 'svelte';
import { io } from 'socket.io-client';
import type { Tags } from '$lib/tag/tags';
import { browser } from '$app/environment';


const KEY = "Tags";

function setTagsContext(init: Tags): Tags {
	const tags = $state<Tags>(init);
	setContext(KEY, tags);
	return tags;
}

export function getTagsContext(): Tags {
	return getContext(KEY);
}



// pass object to be shared across client and server
export function socketIoTagsClient(initalState: Tags)
{

    if(browser == false) 
    {
        setTagsContext(initalState);
        return;
    }
    
    console.log("createSocket on Client");
    const socket = io();//io("ws://localhost:3000");

    socket.on("connect", () => {
        console.log("socket connected");
    });

    socket.on("disconnect", () => {
        console.log("socket disconnected");
    });

    setTagsContext(socketIoIfy(initalState, "tags"));


    // TODO FIX ARRAY's 
    //let test = socketIoIfy([{test: 1, demo: 2, is:false}, {boo: false}])

    function socketIoIfy(obj: any, topic: string) 
    {
        if(typeof obj === 'object') 
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
