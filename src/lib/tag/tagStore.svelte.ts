import { io } from 'socket.io-client';
import type { Tags } from '$lib/tag/tags';
import type { BaseTag } from './baseTag';


/*
export function createTagStore(obj: BaseTag)
{
    let name: string = obj.name;
    let data = runify(obj.data);

    return {
        get name() { return name },

        get data() { return data },
        set data(v) { data = v }
    }
}
*/

export let tags = $state({
    aprt01: {
        name: "aprt01",
        data: {
            value: false,
            fault: false
        },
        enabled: true
    } as BaseTag<DigitalIn>,

    aprt02: {
        name: "aprt02",
        data: {
            value: false,
            fault: false
        },
        enabled: true
    } as BaseTag<DigitalIn>,

    attx01: {
        name: "attx01",
        data: {
            value: 0,
            fault: false,
            scaling: {
                inMin: 0,
                inMax: 1023,
                outMin: 0,
                outMax: 100
            }
        },
        enabled: true
    } as BaseTag<AnalogIn>,
});

/*
export function createSocketIo()
{
    console.log("createSocket on Client");
    const socket = io('ws://localhost:5173');

    // restore the subscriptions upon reconnection
    socket.on("connect", () => {
        console.log("socket connected");
        // new connection get tags data
        if(tags == undefined)
        {
            console.log("tags:read client");
            socket.emit("tags:read");
        }
        // always subscribe for updates
        socket.emit("tags:subscribe");
    });


    socket.on("disconnect", () => {
        console.log("socket disconnected");
    });


    socket.on("tags:read", (data) => {
        console.log(data);
        tags = data;
    });


    socket.on("tag:update", (tag) => {
        // WIP if((tag in tags) == false) return; // no key of that name in tags
        tags[tag.name as keyof typeof tags] = tag;
        console.log("tag:update " + tag.name);
        console.log(tag);
    });

    function unsubscribeAll()
    {
        socket.emit("tags:unsubscribe");
        socket.disconnect();
    }

    function writeTag(tag: BaseTagServer<object>)
    {
        //WIP move to tags.tag.set() so we can check its been updated on the server before setting state
        console.log(tag);
        socket.emit("tag:update", tag);
    }
}*/