<script lang="ts">
    import type { BaseTag } from '$lib/tag/baseTag.ts';
    import { flash } from '$lib/ui/flash.svelte';
    import type { MouseEventHandler } from 'svelte/elements';

    type props = {
        tag: BaseTag<AnalogIn>;
        style?: string;
        onclick?: MouseEventHandler<any>;
        faultFlash?: boolean;
    };

    let { tag, style = "", onclick, faultFlash = false } : props = $props();

    let c = $state("fault"); // default state
    
    $effect(() => {
        c = "";
        if(tag.data.fault && faultFlash && flash.isOn) c = "fault";
    });

</script>
<div class={c} style={style} onclick={onclick} role="button" tabindex="0">
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