<script lang="ts">
  import { getEditorContext } from "$lib/client/editor/editorContext";
  import type { ElementRecord } from "$lib/page/elementTypes";
  import type { Snippet } from "svelte";
  import { attempt } from "$lib/util/attempt";
  import { svgNamespace } from "$lib/page/svgTags";

  type Props = {
    children: Snippet;
    element: ElementRecord;
    insideSvg?: boolean;
  };

  let { children, element, insideSvg }: Props = $props();

  const editorContext = attempt(() => getEditorContext());
  const editor = editorContext.isOk ? editorContext.data : undefined;

  // default to preview or normal render if no editor context is found
  let activeMode = $derived(editor?.mode ?? "preview");
  let selected = $derived(activeMode === "edit" && editor?.selectedElementId === element.id);

  function select(event: MouseEvent) {
    if (!editor) return;
    if (activeMode !== "edit") return;
    event.stopPropagation();
    editor.selectedElementId = element.id;
  }

  function selectOnEnter(event: KeyboardEvent) {
    if (!editor) return;
    if (activeMode !== "edit") return;
    if (event.key === "Enter") editor.selectedElementId = element.id;
  }
</script>

{#if activeMode === "edit"}
  {#if insideSvg}
    <g
      role="presentation"
      onclick={select}
      onkeydown={selectOnEnter}
      class:edit-disable-pointer={activeMode === "edit"}
      class:outline-2={selected}
      class:outline-primary-500={selected}
      class:-outline-offset-2={selected}
    >
      {@render children?.()}
      {#if selected && false}
        <rect
          xmlns={svgNamespace}
          width="6"
          height="6"
          x="-3"
          y="-3"
          class="stroke-primary-500 stroke-2"
        ></rect>

        <rect
          xmlns={svgNamespace}
          width="6"
          height="6"
          x="-3"
          y="100%"
          class="stroke-primary-500 stroke-2"
        ></rect>
        <rect
          xmlns={svgNamespace}
          width="6"
          height="6"
          x="100%"
          y="100%"
          class="stroke-primary-500 stroke-2"
        ></rect>
        <rect
          xmlns={svgNamespace}
          width="6"
          height="6"
          x="100%"
          y="-3"
          class="stroke-primary-500 stroke-2"
        ></rect>
      {/if}
    </g>
  {:else}
    <div
      class="inline-block"
      role="presentation"
      onclick={select}
      onkeydown={selectOnEnter}
      class:edit-disable-pointer={activeMode === "edit"}
      class:outline-2={selected}
      class:outline-primary-500={selected}
      class:-outline-offset-2={selected}
    >
      {@render children?.()}
    </div>
  {/if}
{/if}

<style>
  .edit-disable-pointer :global(:is(input, textarea, select, button, a[href])) {
    pointer-events: none;
  }
</style>
