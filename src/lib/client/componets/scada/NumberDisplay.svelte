<script lang="ts">
  import type { TagPaths } from "$lib/server/tag/tag";
  import { ClientTag } from "$lib/client/tag/tagState.svelte";
  import { flash } from "$lib/ui/flash.svelte";
  import type { MouseEventHandler } from "svelte/elements";

  type props = {
    path: TagPaths;
    style?: string;
    onclick?: MouseEventHandler<any>;
    faultFlash?: boolean;
  };

  let { path, style = "", onclick, faultFlash = false }: props = $props();

  // setup client tag of expected type Double
  let tag = new ClientTag("number", { path });
  let clazz = $state("fault"); // default state

  onclick = () => {
    tag.write(tag.value - 1);
  };

  $effect(() => {
    clazz = "";
    //if (tag.value.fault && faultFlash && flash.isOn) clazz = "fault";
  });

  // for every instance of component subscribe to tag updates from the server
  $effect.root(() => {
    tag.subscribe();
    return () => {
      tag.unsubscribe(); // unsibscribe when unmounted
    };
  });
</script>

<svelte:boundary>
  <div class={clazz} {style} {onclick} role="button" tabindex="0">
    <span class="label">{tag.name}</span>
    <span class="value">{tag.value}</span>
  </div>

  {#if tag.errorMessage}
    <p style="background-color: red;">{tag.errorMessage}</p>
  {/if}

  {#snippet failed(error)}
    <p>{error.message}</p>
  {/snippet}
</svelte:boundary>

<style>
  div {
    display: flex;
    flex-direction: row;
    align-items: center;
    padding: 0.2rem;
    gap: 0.5rem;
    background-color: var(--app-color-neutral-400);
    border: 0.07rem solid var(--app-color-neutral-000);
  }

  p {
    font-size: 0.6rem;
    padding: 0.1rem 0.2rem;
    margin: 0;
  }

  .label {
  }

  .value {
    font-size: 0.8rem;
  }

  .fault {
    background-color: var(--app-color-state-fault);
  }
</style>
