<script lang="ts">
  import { Box, Boxes, Plus } from "@lucide/svelte";
  import { getEditorContext } from "$lib/client/editor/editorContext";
  import { baseComponentNames } from "$lib/page/baseComponents";
  import type { ElementRecord } from "$lib/page/elementTypes";
  import { elementParentError, isSvgContainer, sortedChildren } from "$lib/page/elementTypes";

  const editor = getEditorContext();

  let customTag = $state("div");
  let customSvgTag = $state("rect");
  let baseComponent = $state(baseComponentNames[0] ?? "TagInput");
  let userComponentId = $state(editor.userComponents[0]?.component.id ?? "");

  let target = $derived(editor.insertionTargetElement);
  let targetIsSvg = $derived(isSvgContainer(target));

  function addHtml() {
    const tag = customTag.trim();
    if (!tag || targetIsSvg) return;
    editor.addElement("html", { tag });
  }

  function addSvg(tag: string) {
    const value = tag.trim();
    if (!value) return;
    editor.addElement("svg", { tag: value });
  }

  function addBase() {
    if (targetIsSvg) return;
    editor.addElement("base-component", {
      baseComponent,
      name: baseComponent,
    });
  }

  function addUserComponent() {
    if (!userComponentId || targetIsSvg) return;
    const component = editor.userComponents.find((item) => item.component.id === userComponentId);
    editor.addElement("user-component", {
      referencedComponentId: userComponentId,
      name: component?.component.name ?? "component",
    });
  }

  function siblings(element: ElementRecord) {
    return sortedChildren(editor.elements, element.parentId);
  }

  function move(element: ElementRecord, direction: -1 | 1) {
    const items = siblings(element);
    const index = items.findIndex((item) => item.id === element.id);
    const target = items[index + direction];
    if (!target) return;
    editor.elementCollection?.update(element.id, {
      sortIndex: target.sortIndex,
      updatedAt: Date.now(),
    });
    editor.elementCollection?.update(target.id, {
      sortIndex: element.sortIndex,
      updatedAt: Date.now(),
    });
  }

  function canIndent(element: ElementRecord) {
    const items = siblings(element);
    const index = items.findIndex((item) => item.id === element.id);
    const previous = items[index - 1];
    return !!previous && !elementParentError(element, previous);
  }

  function canOutdent(element: ElementRecord) {
    const parent = element.parentId ? editor.elements[element.parentId] : null;
    if (!parent) return false;
    const nextParent = parent.parentId ? (editor.elements[parent.parentId] ?? null) : null;
    return !elementParentError(element, nextParent);
  }

  function indent(element: ElementRecord) {
    const items = siblings(element);
    const index = items.findIndex((item) => item.id === element.id);
    const previous = items[index - 1];
    if (!previous || elementParentError(element, previous)) return;
    editor.elementCollection?.update(element.id, {
      parentId: previous.id,
      updatedAt: Date.now(),
    });
  }

  function outdent(element: ElementRecord) {
    const parent = element.parentId ? editor.elements[element.parentId] : null;
    if (!parent) return;
    const nextParentId = parent.parentId;
    const nextParent = nextParentId ? (editor.elements[nextParentId] ?? null) : null;
    if (elementParentError(element, nextParent)) return;
    editor.elementCollection?.update(element.id, {
      parentId: nextParentId,
      updatedAt: Date.now(),
    });
  }
</script>

<div class="flex flex-col text-xs">
  <div class="flex flex-col gap-1 p-2 border-b border-surface-200-800">
    <div class="flex items-center justify-between gap-1">
      <span class="opacity-60 truncate">
        insert into {target ? target.name || target.tag || target.id : "page root"}
        {#if targetIsSvg}<span class="opacity-60">(svg)</span>{/if}
      </span>
      <button class="btn btn-sm preset-tonal" onclick={() => (editor.selectedElementId = null)}>
        Root
      </button>
    </div>

    {#if targetIsSvg}
      <div class="flex gap-1">
        <input
          class="input py-0 px-1 h-7 min-w-0 flex-1"
          bind:value={customSvgTag}
          placeholder="svg tag"
        />
        <button
          class="btn btn-sm preset-filled"
          onclick={() => addSvg(customSvgTag)}
          title="Add SVG element"
        >
          <Plus class="size-3.5" /> SVG
        </button>
      </div>
    {:else}
      <div class="flex gap-1">
        <input class="input py-0 px-1 h-7 min-w-0 flex-1" bind:value={customTag} />
        <button class="btn btn-sm preset-filled" onclick={addHtml} title="Add HTML element">
          <Plus class="size-3.5" /> HTML
        </button>
      </div>
    {/if}

    <div class="flex flex-wrap gap-1">
      <button class="btn btn-sm preset-tonal" onclick={() => addSvg("svg")}>SVG container</button>
      <button
        class="btn btn-sm preset-tonal"
        disabled={!targetIsSvg}
        onclick={() => addSvg("rect")}
      >
        Rect
      </button>
      <button
        class="btn btn-sm preset-tonal"
        disabled={!targetIsSvg}
        onclick={() => addSvg("circle")}
      >
        Circle
      </button>
      <button
        class="btn btn-sm preset-tonal"
        disabled={!targetIsSvg}
        onclick={() => addSvg("text")}
      >
        Text
      </button>
    </div>

    {#if !targetIsSvg}
      <div class="flex gap-1">
        <select class="input py-0 px-1 h-7 min-w-0 flex-1" bind:value={baseComponent}>
          {#each baseComponentNames as name}
            <option value={name}>{name}</option>
          {/each}
        </select>
        <button class="btn btn-sm preset-tonal" onclick={addBase} title="Add base component">
          <Box class="size-3.5" />
        </button>
      </div>

      <div class="flex gap-1">
        <select class="input py-0 px-1 h-7 min-w-0 flex-1" bind:value={userComponentId}>
          {#each editor.userComponents as definition (definition.component.id)}
            <option value={definition.component.id}>{definition.component.name}</option>
          {/each}
        </select>
        <button
          class="btn btn-sm preset-tonal"
          disabled={!userComponentId}
          onclick={addUserComponent}
          title="Add user component"
        >
          <Boxes class="size-3.5" />
        </button>
      </div>
    {/if}
  </div>

  {#if editor.selectedElementId && editor.elements[editor.selectedElementId]}
    {@const selected = editor.elements[editor.selectedElementId]}
    <div class="grid grid-cols-2 gap-1 p-2 border-t border-surface-200-800">
      <button class="btn btn-sm preset-tonal" onclick={() => move(selected, -1)}>Up</button>
      <button class="btn btn-sm preset-tonal" onclick={() => move(selected, 1)}>Down</button>
      <button
        class="btn btn-sm preset-tonal"
        disabled={!canIndent(selected)}
        onclick={() => indent(selected)}
      >
        Indent
      </button>
      <button
        class="btn btn-sm preset-tonal"
        disabled={!canOutdent(selected)}
        onclick={() => outdent(selected)}
      >
        Outdent
      </button>
    </div>
  {/if}
</div>
