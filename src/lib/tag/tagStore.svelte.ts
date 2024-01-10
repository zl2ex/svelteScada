import { setContext, getContext } from 'svelte';
import { io } from 'socket.io-client';
import type { Tags } from '$lib/tag/tags';
import { browser } from '$app/environment';
import { getSetIfy } from './getSetIfy';


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

/*
    setTagsContext(getSetIfy(initalState, "tags",
        (path: string, value: any) => {
            return value;
        },
        (path: string, value: any, newValue: any) => {
            console.log('setting', path, newValue);
            value = newValue;
            socket.emit(`${path}:update`, value);
            return value;
        },
        (path: string, value: any) => {
            // register socket on update event to get updates from client
            socket.on(`${path}:update`, (newValue) => {
                console.log(`${path}:update`, newValue);
                value = newValue;
            });
        },
    ));
*/

    // TODO FIX ARRAY's 
    //let test = socketIoIfy([{test: 1, demo: 2, is:false}, {boo: false}])

    function socketIoIfy(obj: any, topic: string): any
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
                console.log(`define properties ${topic}.${key}`);
                Object.defineProperty(output, key, {
                    get() { return rune[key]; },
                    set(val)
                    {
                        console.log(`${topic}.${key}:update`, val);
                        socket.emit(`${topic}.${key}:update`, val);
                        rune[key] = val;
                    },
                    enumerable: true
                });

                socket.on(`${topic}.${key}:update`, (value) => {
                    console.log(`${topic}.${key}:update`, value);
                    rune[key] = value;
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
}
