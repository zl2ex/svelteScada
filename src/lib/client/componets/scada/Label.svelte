<script lang="ts">
  import Label from "./Label.svelte"; // self
  import type { TagPaths } from "$lib/server/tag/tag";
  import { ClientTag } from "$lib/client/tag/clientTag.svelte";
  import type {
    HTMLButtonAttributes,
    MouseEventHandler,
  } from "svelte/elements";
  import { onMount } from "svelte";

  type propsPath = {
    path: TagPaths;
    clientTag?: never;
    label?: string;
    attributes?: HTMLButtonAttributes;
  };

  type propsClientTag = {
    path?: never;
    clientTag: ClientTag<any>;
    label?: string;
    attributes?: HTMLButtonAttributes;
  };

  type props = propsPath | propsClientTag;

  let { path, clientTag, label, attributes }: props = $props();

  // either provided client tag or create a new instance with the path
  let tag = $derived.by(() => {
    let tag = clientTag ?? new ClientTag("any", { path: path ?? "" });

    //subscribe to updates from the server over socket.io
    tag?.subscribe();
    return tag;
  });

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
    {...attributes}
    type="button"
    class={tag.errorMessage || tag.statusCodeString !== "Good"
      ? "error tooltip"
      : "tooltip"}
  >
    <label for="input" class="label">{label ?? tag.options.name}</label>
    {#if typeof tag.value === "boolean"}
      <input
        type="checkbox"
        name="input"
        class="checkbox"
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
        class="input"
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
        class="input"
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
      <span class="issue tooltiptext">{tag.statusCodeString}</span>
    {/if}
    {#if tag.errorMessage}
      <span class="issue tooltiptext">{tag.errorMessage}</span>
    {/if}
  </button>

  {#snippet failed(error)}
    <p class="issue">{error.message}</p>
  {/snippet}
</svelte:boundary>
