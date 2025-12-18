<script lang="ts">
  import Label from "./Label.svelte"; // self
  import type { TagPaths } from "$lib/server/tag/tag";
  import { ClientTag } from "$lib/client/tag/clientTag.svelte";
  import type { MouseEventHandler } from "svelte/elements";
  import { onMount } from "svelte";

  type propsPath = {
    path: TagPaths;
    clientTag?: ClientTag<any>;
    label?: string;
    style?: string;
    onclick?: MouseEventHandler<any>;
  };

  type propsClientTag = {
    path?: TagPaths;
    clientTag: ClientTag<any>;
    label?: string;
    style?: string;
    onclick?: MouseEventHandler<any>;
  };

  type props = propsPath | propsClientTag;

  let { path, clientTag, label, style, onclick }: props = $props();

  // either provided client tag or create a new instance with the path
  let tag = clientTag ?? new ClientTag("any", { path });
  //subscribe to updates from the server over socket.io
  tag.subscribe();

  let isFocus = $state(false);

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
    class={tag.errorMessage ? "error tooltip" : "tooltip"}
  >
    <label for="input">{label ? label : tag.options.name}</label>
    {#if typeof tag.value === "boolean"}
      <input
        type="checkbox"
        name="input"
        checked={isFocus ? undefined : tag.value}
        oninput={(ev) => {
          console.debug(ev.currentTarget.checked);
          tag.write(Boolean(ev.currentTarget.checked));
        }}
        disabled={!tag.options.writeable}
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
        disabled={!tag.options.writeable}
      />
    {:else if typeof tag.value === "string"}
      <input
        type="text"
        name="input"
        value={isFocus ? undefined : tag.value}
        onkeyup={(ev) => {
          if (ev.currentTarget) {
            if (ev.key === "Enter") {
              tag.write(String(ev.currentTarget.value));
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
            tag.write(String(ev.currentTarget?.value));
          } else {
            ev.currentTarget.value = tag.value;
          }
          isFocus = false;
        }}
        onfocusin={() => {
          isFocus = true;
        }}
        disabled={!tag.options.writeable}
      />
    {:else if typeof tag.value === "object" && tag.value && tag.children}
      {#each tag.children.values() as childTag}
        <Label clientTag={childTag}></Label>
      {/each}
    {:else}
      unsupported type {typeof tag.value}
    {/if}
    {#if tag.statusCodeString !== "Good"}
      <span class="issue">{tag.statusCodeString}</span>
    {/if}
    {#if tag.errorMessage}
      <span class="issue tooltiptext">{tag.errorMessage}</span>
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
