<script lang="ts">
  import { getEditorContext } from "$lib/client/editor/editorContext";
  import { handleEditorKeyup, isEditableTarget } from "$lib/client/editor/editorKeyboard";
  import type { EditorMode, UserComponentDefinition } from "$lib/client/editor/editorState.svelte";
  import type { ContainerType, ElementRecord } from "$lib/elements/elementTypes";
  import { attempt } from "$lib/util/attempt";
  import { tick } from "svelte";
  import {
    containerTypeStyle,
    elementStyleToString,
    sortedChildren,
  } from "$lib/elements/elementTypes";
  import { Menu, Portal } from "@skeletonlabs/skeleton-svelte";
  import PageElement from "./PageElement.svelte";
  import PageCanvasMoveable from "./PageCanvasMoveable.svelte";

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
  let moveableTargets = $state<Array<HTMLElement | SVGElement>>([]);
  let selectedElements = $derived(editor?.selectedElements ?? []);

  $effect(() => {
    if (activeMode === "preview") canvasElement?.focus({ preventScroll: true });
  });

  $effect(() => {
    const ids = activeMode === "edit" ? (editor?.selectedElementIds ?? []) : [];
    void roots;
    void selectedElements;
    let cancelled = false;

    tick().then(() => {
      if (cancelled || !canvasElement) return;
      moveableTargets = ids.flatMap((id) => {
        const target = canvasElement?.querySelector<HTMLElement | SVGElement>(
          `[data-element-id="${CSS.escape(id)}"]`,
        );
        return target ? [target] : [];
      });
    });

    return () => {
      cancelled = true;
    };
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
      onclick={(event) => {
        if (activeMode !== "edit") return;
        const target = event.target instanceof Element ? event.target : null;
        if (
          target?.closest(
            ".moveable-control-box, .moveable-line, .moveable-control, .moveable-area, .moveable-origin",
          )
        ) {
          return;
        }
        const element = target?.closest<HTMLElement>("[data-element-id]");
        const id = element?.dataset.elementId;
        if (id) {
          editor?.selectElement(id, {
            additive: event.ctrlKey || event.metaKey,
            range: event.shiftKey,
          });
          return;
        }
        editor?.clearElementSelection();
      }}
    >
      <div
        class="page-canvas"
        class:page-grid={editor?.grid.enabled}
        style="{canvasStyle};--grid-spacing:{editor?.grid.spacing ?? 20}px"
        data-theme={themeName}
      >
        {#if roots.length === 0}
          <div class="absolute inset-0 flex items-center justify-center text-sm text-surface-500">
            Empty page — add an element from the Elements tab.
          </div>
        {/if}
        {#each roots as element (element.id)}
          <PageElement
            {element}
            {elements}
            mode={activeMode}
            userComponents={componentDefinitions}
          />
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

{#if activeMode === "edit" && canvasElement && moveableTargets.length > 0}
  <PageCanvasMoveable {canvasElement} targets={moveableTargets} {selectedElements} />
{/if}

<style>
  .page-canvas {
    position: relative;
    min-height: 80vh;
  }

  .page-grid {
    background-image:
      linear-gradient(
        to right,
        color-mix(in oklab, var(--color-surface-500) 10%, transparent) 1px,
        transparent 1px
      ),
      linear-gradient(
        to bottom,
        color-mix(in oklab, var(--color-surface-500) 10%, transparent) 1px,
        transparent 1px
      );
    background-size: var(--grid-spacing) var(--grid-spacing);
  }
</style>
