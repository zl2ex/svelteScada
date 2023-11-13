<script lang="ts">
    import type { PageData } from './$types';
    import DigitalInRound from '$lib/componets/DigitalInRound.svelte';
    
    //export let data: PageData;

    import { io } from 'socket.io-client';
    import { onDestroy } from 'svelte';

    const socket = io();

    let subscriptions: string[] = [];

    function subscribe(topic: string) 
    {
        subscriptions.push(topic);
        if (socket.connected) 
        {
            socket.emit("subscribe", [topic]);
        }
    }

    function unsubscribe(topic: string) 
    {
        const i = subscriptions.indexOf(topic);
        if (i !== -1) 
        {
            subscriptions.splice(i, 1);
            if (socket.connected) 
            {
                socket.emit("unsubscribe", topic);
            }
        }
    }

    function unsubscribeAll()
    {
        for (let topic of subscriptions)
        {
            unsubscribe(topic);
        }
    }

    // restore the subscriptions upon reconnection
    socket.on("connect", () => {
        if (subscriptions.length && !socket.recovered) {
            socket.emit("subscribe", subscriptions);
        }
    });

    //subscribe("aprt01");

    socket.on("connect", () => {
        console.log("Socket connected");
    });

    socket.on("aprt01", (data) => {
        aprt01.data = data;
    });


    let aprt01: BaseTag<DigitalIn> = {
        name: "aprt01",
        data: {
            value: false,
            fault: true
        },
        enabled: true
    };

      // WIP  ////////////////////////////////
    function onClick()
    {
        aprt01.data.fault = !aprt01.data.fault;
        socket.emit("aprt01", aprt01.data);
    }
///////////////////////////////////////

    onDestroy(unsubscribeAll);

</script>

<DigitalInRound bind:tag={aprt01} on:click={onClick} size="20px" faultFlash/>