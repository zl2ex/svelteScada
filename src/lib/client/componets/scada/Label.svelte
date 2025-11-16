<script lang="ts">
  import type { TagPaths } from "$lib/server/tag/tag";
  import { ClientTag } from "$lib/client/tag/tagState.svelte";
  import type { MouseEventHandler } from "svelte/elements";
  import { onMount } from "svelte";

  type props = {
    path: TagPaths;
    label?: string;
    style?: string;
    onclick?: MouseEventHandler<any>;
  };

  let { path, label, style, onclick }: props = $props();

  // setup client tag of expected type Double
  let tag = new ClientTag("any", { path });
  let isFocus = $state(false);

  // for every instance of component subscribe to tag updates from the server
  $effect.root(() => {
    tag.subscribe();
  });

  onMount(() => {
    // on unmount
    return () => {
      // TD WIP Causing subscribe issues on server
      tag.dispose();
    };
  });
</script>

<svelte:boundary>
  <button
    {style}
    {onclick}
    type="button"
    class={tag.error ? "error tooltip" : "tooltip"}
  >
    <label for="input">{label ? label : tag.name}</label>
    {#if typeof tag.value === "boolean"}
      <input
        type="checkbox"
        checked={tag.value}
        oninput={(ev) => {
          tag.write(Boolean(ev.target?.checked));
        }}
      />
    {:else if typeof tag.value === "number"}
      <input
        type="number"
        name="input"
        value={isFocus ? undefined : tag.value}
        onkeyup={(ev) => {
          if (ev.currentTarget) {
            if (ev.key === "Enter") {
              tag.write(Number(ev.currentTarget.value));
              // Create a new FocusEvent
              ev.currentTarget.blur();
            }
            if (ev.key === "Escape") {
              ev.currentTarget.value = tag.value;
              ev.currentTarget.blur();
            }
          }
        }}
        onfocusout={(ev) => {
          if (ev.currentTarget.value) {
            tag.write(Number(ev.currentTarget?.value));
          } else {
            ev.currentTarget.value = tag.value;
          }
          isFocus = false;
        }}
        onfocusin={() => {
          isFocus = true;
        }}
        disabled={!tag.writeable}
      />
    {:else if typeof tag.value === "string"}
      <input
        type="text"
        value={tag.value}
        disabled={!tag.writeable}
        oninput={(ev) => {
          tag.write(String(ev.target?.value));
        }}
      />
    {:else if typeof tag.value === "object" && tag.value}
      {#each Object.entries(tag.value) as [key, value]}
        {#if typeof tag.value === "boolean"}
          <input
            type="checkbox"
            checked={tag.value}
            disabled={!tag.writeable}
            oninput={(ev) => {
              tag.write(Boolean(ev.target?.checked));
            }}
          />
        {:else if typeof tag.value === "number"}
          <input
            type="number"
            value={tag.value}
            disabled={!tag.writeable}
            oninput={(ev) => {
              tag.write(Number(ev.target?.value));
            }}
          />
        {:else if typeof tag.value === "string"}
          <input
            type="text"
            value={tag.value}
            disabled={!tag.writeable}
            oninput={(ev) => {
              tag.write(String(ev.target?.value));
            }}
          />
        {/if}
      {/each}
    {:else}
      unsupported type {typeof tag.value}
    {/if}
    {#if tag.valueStatus !== "Good"}
      <span class="issue">{tag.valueStatus}</span>
    {/if}
    {#if tag.error?.message}
      <span class="issue tooltiptext">{tag.error.message}</span>
    {/if}
  </button>

  {#snippet failed(error)}
    <p class="issue">{error.message}</p>
  {/snippet}
</svelte:boundary>

<style>
  button {
    display: flex;
    flex-direction: row;
    align-items: center;
    padding: 0.2rem;
    gap: 0.5rem;
    background-color: inherit;
    border: none;
  }

  button:active,
  button:hover {
    opacity: 1;
  }

  input {
    max-width: 10ch;
  }

  .error {
    border: 0.1rem dashed var(--app-color-state-error);
    /*background-color: var(--app-color-state-error);*/
  }

  /* Tooltip container */
  .tooltip {
    position: relative; /* Essential for positioning the tooltip text */
    /*display: inline-block; /* Or block, depending on your layout needs */
    /*cursor: pointer; /* Indicates interactivity */
  }

  /* Tooltip text */
  .tooltiptext {
    visibility: hidden; /* Hidden by default */
    background-color: var(--app-color-neutral-200);
    text-align: center;
    padding: 0.2rem 0.2rem;
    border: 0.2rem solid var(--app-color-neutral-400);
    border-radius: 0.2rem;
    position: absolute; /* Positioned relative to its parent (.tooltip) */
    z-index: 500; /* Ensures it appears above other content */
    /* Optional: Positioning adjustments */
    /*bottom: 125%; /* Example: above the trigger */
    /* left: 50%;
    margin-left: -65px; /* Half of the width to center it */
    bottom: 150%;
    opacity: 0; /* For fade-in effect */
    transition: opacity 0.3s; /* Smooth transition */
  }

  /* Show the tooltip text on hover */
  .tooltip:hover .tooltiptext {
    visibility: visible;
    opacity: 1; /* Fade in */
  }
</style>
