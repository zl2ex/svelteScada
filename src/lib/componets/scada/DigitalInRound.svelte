<script lang="ts">
    import type { BaseTag } from '$lib/tag/baseTag.ts';
    import { flash } from '$lib/ui/flash.svelte';

    type props = {
        tag: BaseTag<DigitalIn>;
        style?: string;
        faultFlash?: boolean;
    };

    let { tag, style = "", faultFlash = false } = $props<props>();


    let c = $state("fault"); // default state

   
    
    $effect(() => {
        c = "";
        if(tag?.data.value) c = "on"
        if(tag?.data.fault) c = "fault";

        if(faultFlash) 
        {
            // flash on fault
            if(tag?.data.fault && flash.isOn) c = "";
        }
    });

</script>
    <p>{tag?.name}</p>
    <svg viewBox="0 0 60 60" class={c} style={style} on:click>
        <g stroke-width="5%">
            <text>T</text>
            <circle cx="50%" cy="50%" r="45%"></circle>
        </g>
    </svg>

<style>

    svg
    {
        fill: var(--app-color-neutral-400);
        stroke: var(--app-color-neutral-000);
       
        
    }

    text
    {
        font: italic 6px serif;
        fill: var(--app-color-neutral-000);
    }

    p
    {
        font-size: 0.6rem;
        margin: 0;
    }

    .on
    {
        fill: var(--app-color-state-on);
    }

    .fault
    {
        fill: var(--app-color-state-fault);
    }
</style>