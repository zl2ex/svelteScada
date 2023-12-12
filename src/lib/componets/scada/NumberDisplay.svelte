<script lang="ts">
    import type { BaseTag } from '$lib/tag/baseTag.ts';
    import { flash } from '$lib/ui/flash.svelte';

    type props = {
        tag: BaseTag<AnalogIn>;
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
<div class={c} style={style} on:click>
    <p class="label">{tag.name}</p>
    <p class="value">{tag.data.value}</p>
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