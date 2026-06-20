<script lang="ts">
  import TagInput from "./TagInput.svelte"; // self
  import type { TagPaths } from "$lib/server/tag/tag";
  import { ClientTag } from "$lib/client/tag/clientTag.svelte";
  import type { HTMLInputAttributes } from "svelte/elements";
  import { onMount } from "svelte";
  import { Portal, Tooltip } from "@skeletonlabs/skeleton-svelte";

  interface propsPath extends HTMLInputAttributes {
    path: TagPaths;
    clientTag?: never;
    label?: string;
    clazz?: string;
  }

  interface propsClientTag extends HTMLInputAttributes {
    path?: never;
    clientTag: ClientTag<any>;
    label?: string;
    clazz?: string;
  }

  type props = propsPath | propsClientTag;

  let { path, clientTag, label, clazz, ...rest }: props = $props();

  /*
  const id = $props.id();
  const tooltip = useTooltip({ id });
*/
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
  <!--<button {...rest} type="button" tabindex="-1">-->
  <label for="input" class="label">{label ?? tag.options.name}</label>
  <Tooltip positioning={{ placement: "top" }}>
    <Tooltip.Trigger tabindex={-1}>
      {#if typeof tag.value === "boolean"}
        <input
          type="checkbox"
          name="input"
          class={tag.errorMessage || tag.statusCodeString !== "Good"
            ? "checkbox outline -outline-offset-1 outline-error-400-600 " +
              clazz
            : "checkbox " + clazz}
          checked={isFocus ? undefined : tag.value}
          oninput={(ev) => {
            console.debug(ev.currentTarget.checked);
            tag.write(Boolean(ev.currentTarget.checked));
          }}
          disabled={!tag.options.writeable}
          {...rest}
        />
      {:else if typeof tag.value === "number"}
        <input
          type="number"
          name="input"
          class={tag.errorMessage || tag.statusCodeString !== "Good"
            ? "input outline -outline-offset-1 outline-error-400-600 " + clazz
            : "input " + clazz}
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
          {...rest}
        />
      {:else if typeof tag.value === "string"}
        <input
          type="text"
          name="input"
          class={tag.errorMessage || tag.statusCodeString !== "Good"
            ? "input outline -outline-offset-1 outline-error-400-600 " + clazz
            : "input " + clazz}
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
          {...rest}
        />
      {:else if typeof tag.value === "object" && tag.value && tag.children}
        {#each tag.children.values() as childTag}
          <TagInput clientTag={childTag} {...rest}></TagInput>
        {/each}
      {:else}
        unsupported type {typeof tag.value}
      {/if}
    </Tooltip.Trigger>
    {#if tag.statusCodeString !== "Good" || tag.errorMessage}
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content class="card p-2 preset-filled-error-400-600">
            {#if tag.statusCodeString !== "Good"}
              <p class="heading-font-weight">{tag.statusCodeString}</p>
            {/if}
            <p>{tag.errorMessage}</p>
          </Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    {/if}
  </Tooltip>

  {#snippet failed(error)}
    <p class="text-error-400-600">{error.message}</p>
  {/snippet}
</svelte:boundary>
