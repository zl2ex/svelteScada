<script lang="ts">
  import { getEditorContext } from "$lib/client/editor/editorContext";
  import { handleEditorKeydown, isEditableTarget } from "$lib/client/editor/editorKeyboard";
  import type { EditorMode } from "$lib/client/editor/editorState.svelte";
  import type { ContainerType, ElementRecord } from "$lib/page/elementTypes";
  import { containerTypeStyle, elementStyleToString, sortedChildren } from "$lib/page/elementTypes";
  import PageElement from "./PageElement.svelte";
  import PageElementEditWrapper from "./PageElementEditWrapper.svelte";

  type Props = {
    elements: Record<string, ElementRecord>;
    containerType?: ContainerType;
    mode?: EditorMode;
  };

  let { elements, containerType = "absolute", mode = "edit" }: Props = $props();
  const editor = getEditorContext();
  let canvasElement: HTMLDivElement | undefined = $state();

  let roots = $derived(sortedChildren(elements, null));
  let canvasStyle = $derived(elementStyleToString(containerTypeStyle(containerType)));

  $effect(() => {
    if (mode === "preview") canvasElement?.focus({ preventScroll: true });
  });
</script>

<div
  bind:this={canvasElement}
  class="relative min-h-full w-full overflow-auto bg-surface-50-950 outline-none"
  role="presentation"
  tabindex="-1"
  onpointerdowncapture={(event) => {
    if (isEditableTarget(event.target)) return;
    canvasElement?.focus({ preventScroll: true });
  }}
  onkeydown={(event) => handleEditorKeydown(editor, event)}
  onclick={() => {
    if (mode === "edit") editor.selectedElementId = null;
  }}
>
  <div class="page-canvas" style={canvasStyle}>
    {#if roots.length === 0}
      <div class="absolute inset-0 flex items-center justify-center text-sm text-surface-500">
        Empty page — add an element from the Elements tab.
      </div>
    {/if}
    {#each roots as element (element.id)}
      <PageElementEditWrapper {element}>
        <PageElement {element} {elements} {mode} />
      </PageElementEditWrapper>
    {/each}
  </div>
</div>

<style>
  .page-canvas {
    min-height: 80vh;
  }
</style>
