<script lang="ts">
  import { getEditorContext } from "$lib/client/editor/editorContext";
  import { handleEditorKeyup, isEditableTarget } from "$lib/client/editor/editorKeyboard";
  import type { EditorMode, UserComponentDefinition } from "$lib/client/editor/editorState.svelte";
  import type { ContainerType, ElementRecord } from "$lib/elements/elementTypes";
  import { attempt } from "$lib/util/attempt";
  import {
    containerTypeStyle,
    elementStyleToString,
    sortedChildren,
  } from "$lib/elements/elementTypes";
  import { Menu, Portal } from "@skeletonlabs/skeleton-svelte";
  import PageElement from "./PageElement.svelte";
  import PageElementEditWrapper from "./PageElementEditWrapper.svelte";

  type Props = {
    elements: Record<string, ElementRecord>;
    containerType?: ContainerType;
    mode?: EditorMode;
    userComponents?: UserComponentDefinition[];
    themeName?: string;
  };

  let { elements, containerType = "absolute", mode, userComponents, themeName }: Props = $props();

  const editorResult = attempt(() => getEditorContext());
  const editor = editorResult.isOk ? editorResult.data : undefined;
  let canvasElement: HTMLDivElement | undefined = $state();

  let activeMode = $derived(mode ?? editor?.mode ?? "preview");
  let componentDefinitions = $derived(userComponents ?? editor?.userComponents ?? []);
  let roots = $derived(sortedChildren(elements, null));
  let canvasStyle = $derived(elementStyleToString(containerTypeStyle(containerType)));

  $effect(() => {
    if (activeMode === "preview") canvasElement?.focus({ preventScroll: true });
  });
</script>

<Menu
  onSelect={(details) => {
    console.debug(details.value);
  }}
>
  <Menu.ContextTrigger>
    <div
      bind:this={canvasElement}
      class="relative min-h-full w-full overflow-auto bg-surface-50-950 outline-none"
      role="presentation"
      tabindex="-1"
      onpointerdowncapture={(event) => {
        if (isEditableTarget(event.target)) return;
        canvasElement?.focus({ preventScroll: true });
      }}
      onkeydown={(event) => {
        if (editor) handleEditorKeyup(editor, event);
      }}
      onclick={() => {
        if (activeMode === "edit") editor?.clearElementSelection();
      }}
    >
      <div class="page-canvas" style={canvasStyle} data-theme={themeName}>
        {#if roots.length === 0}
          <div class="absolute inset-0 flex items-center justify-center text-sm text-surface-500">
            Empty page — add an element from the Elements tab.
          </div>
        {/if}
        {#each roots as element (element.id)}
          <PageElementEditWrapper {element}>
            <PageElement
              {element}
              {elements}
              mode={activeMode}
              userComponents={componentDefinitions}
            />
          </PageElementEditWrapper>
        {/each}
      </div>
    </div>
  </Menu.ContextTrigger>
  <Portal>
    <Menu.Positioner>
      <Menu.Content>
        <Menu.Item value="insert">Insert</Menu.Item>
      </Menu.Content>
    </Menu.Positioner>
  </Portal>
</Menu>

<style>
  .page-canvas {
    min-height: 80vh;
  }
</style>
