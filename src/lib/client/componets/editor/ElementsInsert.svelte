<script lang="ts">
  import { Box, Boxes, Plus } from "@lucide/svelte";
  import { getEditorContext } from "$lib/client/editor/editorContext";
  import { getAbilityContext } from "$lib/client/permissions/abilityContext";
  import { baseComponentNames } from "$lib/elements/baseComponents";
  import { isSvgContainer } from "$lib/elements/elementTypes";

  const editor = getEditorContext();
  const ability = getAbilityContext();

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

</script>

<div class="flex flex-col text-xs">
  <fieldset class="contents" disabled={!ability.can("create", "Element")}>
    <div class="flex flex-col gap-1 p-2 border-b border-surface-200-800">
      <div class="flex items-center justify-between gap-1">
        <span class="opacity-60 truncate">
          insert into {target ? target.name || target.tag || target.id : "page root"}
          {#if targetIsSvg}<span class="opacity-60">(svg)</span>{/if}
        </span>
        <button class="btn btn-sm preset-tonal" onclick={() => editor.clearElementSelection()}>
          Root
        </button>
      </div>

      {#if targetIsSvg}
        <div class="flex gap-1">
          <input
            class="input placeholder:opacity-50 py-0 px-1 h-7 min-w-0 flex-1"
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
          onclick={() => addSvg("g")}
        >
          Group
        </button>
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
  </fieldset>
</div>
