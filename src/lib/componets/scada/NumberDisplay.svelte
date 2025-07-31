<script lang="ts">
  import type { NodeIdLiteral } from '$lib/server/opcua/opcuaServer';
  import { ClientTag } from '$lib/tag/ui/tagState.svelte';
    import { flash } from '$lib/ui/flash.svelte';
  import { onMount } from 'svelte';
    import type { MouseEventHandler } from 'svelte/elements';

    type props = {
        nodeId: NodeIdLiteral
        style?: string;
        onclick?: MouseEventHandler<any>;
        faultFlash?: boolean;
    };

    let { nodeId, style = "", onclick, faultFlash = false } : props = $props();

    onclick = () => {
        tag.write(--tag.value[0]);
    }


    let tag = new ClientTag({nodeId}); // setup client tag
    let clazz = $state("fault"); // default state

    $effect(() => {
        clazz = "";
        if(tag.value.fault && faultFlash && flash.isOn) clazz = "fault";
    });

    onMount(() => {
        tag.subscribe();
        return () => {
            tag.unsubscribe(); // unsibscribe when unmounted
        };
    });

</script>
<div class={clazz} style={style} onclick={onclick} role="button" tabindex="0">
    <span class="label">{tag.name}</span>
    <span class="value">{tag.value}</span>
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