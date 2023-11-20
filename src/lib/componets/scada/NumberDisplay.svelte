<script lang="ts">
    import type { BaseTag } from '$lib/tag/baseTag.ts';
    import { browser } from '$app/environment'; 

	export let tag: BaseTag<AnalogIn>;

    export let style: string = "";
    export let faultFlash: boolean = false;

    let c = "fault"; // default state

    let flashToggle = false;
    let intervalId: NodeJS.Timeout | undefined;
    function flash()
    {
        if(!browser) return; // only run on client
        if(tag?.data.fault)
        {
            c = "fault";
            if(flashToggle) c = "";
            flashToggle = !flashToggle;

            if(!intervalId) intervalId = setInterval(flash, 500);
        }
        else
        {
            if(intervalId)
            {
                clearInterval(intervalId);
                intervalId = undefined;
            }
        }
    }
    
    $:
    {
        c = "";
        if(tag?.data.fault) c = "fault";

        if(faultFlash) flash();
    }

</script>
<div class={c} style={style}>
    <p class="label">{tag?.name}</p>
    <p class="value">{tag?.data.value}</p>
</div>

<style>

    div
    {
        display: flex;
        flex-direction: row;
        align-items: center;
        padding: 0.2rem;
        gap: 0.5rem;
        background-color: var(--app-color-neutral-400);
        border: 0.07rem solid var(--app-color-neutral-000);
    }

    p
    {
        font-size: 0.6rem;
        padding: 0.1rem 0.2rem;
        margin: 0;
    }

    .label
    {
        
    }

    .value 
    {
        font-size: 0.8rem;
    }

    .fault
    {
        background-color: var(--app-color-state-fault);
    }
</style>