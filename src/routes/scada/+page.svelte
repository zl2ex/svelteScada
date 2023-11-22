<script lang="ts">
    import { io } from 'socket.io-client';
    import { onDestroy } from 'svelte';
    import { type Writable } from 'svelte/store';

    
    import DigitalInRound from '$lib/componets/scada/DigitalInRound.svelte';
    import type { Tags } from '$lib/tag/tags';
    import type { BaseTag } from '$lib/tag/baseTag';
    import NumberDisplay from '$lib/componets/scada/NumberDisplay.svelte';
    import { createTagStore } from '$lib/tag/tagStore';

    

    //export let data; // server load is cached'

    /*

    function createTagStore()
    {
        let tags = writable<BaseTag<object>>(undefined);
        function update()
        {
            console.log("update");

        }
        return {
            ...tags,
            update
        };
    }

*/
   let tags: Tags;// = createTagStore();

    // WIP Make this auto populate by referencing the tag attribute on elements
    // tags used on page
    let subscriptions: string[] = ["aprt01", "aprt02", "attx01"];
    let tagNames = subscriptions;

    /*

    let tagsArray: Writable<BaseTag<object>> = {};
    for(let name of tagNames)
    {
        tagsArray[name] = createTagStore();
    };

    console.log(tagsArray.attx01.data.value);
    

    
*/

        let tag = {
            tagStoreDemo: createTagStore<AnalogIn>(
            "tagStoreDemo", {
                value: 0,
                scaling: {
                    inMin: 0,
                    inMax: 1023,
                    outMin: 0,
                    outMax: 100
                }, fault: true
            }),
            tagStoreDem01: createTagStore<AnalogIn>(
            "tagStoreDemo1", {
                value: 1,
                scaling: {
                    inMin: 0,
                    inMax: 1023,
                    outMin: 0,
                    outMax: 100
                }, fault: false
            })
        };


        type Tag = typeof tag;

    




    
    const socket = io("ws://localhost:3000");


    // restore the subscriptions upon reconnection
    socket.on("connect", () => {
        // new connection get tags data
        if(tags == undefined) 
        {
            socket.emit("tags:read", subscriptions);
        }
        // always subscribe for updates
        socket.emit("tags:subscribe", subscriptions);
    });


    socket.on("disconnect", () => {
        console.log("socket disconnected");
    });


    
    socket.on("tags:read", (data) => {
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
        socket.emit("tags:unsubscribe", subscriptions);
        socket.disconnect();
    }

    function writeTag(tag: BaseTag<object>)
    {
        //WIP move to tags.tag.set() so we can check its been updated on the server before setting state
        console.log(tag);
       /* let badTag:BaseTag<object> = {
            name:"bad",
            data: {
                value: false,
            },
            enabled: true
        };*/
        socket.emit("tag:update", tag);
    }

      // WIP  ////////////////////////////////
    function onClick()
    {
        tags.aprt01.data.value = !tags.aprt01.data.value;
        writeTag(tags.aprt01);
        console.log("click");
    }


    function onClick1()
    {
        tags.aprt02.data.value = !tags.aprt02.data.value;
        writeTag(tags.aprt02);
        console.log("click");
    }
///////////////////////////////////////

    onDestroy(unsubscribeAll);

</script>

<DigitalInRound tag={tags?.aprt01} on:click={onClick} style="width: 20px" faultFlash/>
<DigitalInRound tag={tags?.aprt02} on:click={onClick1} style="width: 20px" faultFlash/>

<NumberDisplay tag={tag.tagStoreDemo} style="" faultFlash></NumberDisplay>

