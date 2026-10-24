<script lang="ts">
  import { getEditorContext } from "$lib/client/editor/editorContext";
  import type { ContainerType } from "$lib/page/elementTypes";

  const editor = getEditorContext();
  const containerOptions: ContainerType[] = ["none", "absolute", "flex", "grid", "block"];

  let name = $state("");
  let containerType = $state<ContainerType>("none");
  let activePage = $derived(editor.activePage);
  let pageName = $derived(activePage?.name ?? "");
  let pageId = $derived(activePage?.id ?? "");

  $effect(() => {
    if (!activePage) return;
    name = activePage.name;
    containerType = activePage.containerType;
  });

  function saveName() {
    if (!activePage) return;
    editor.pages.update(activePage.id, { name, updatedAt: Date.now() });
  }

  function saveContainer(value: ContainerType) {
    if (!activePage) return;
    containerType = value;
    editor.pages.update(activePage.id, {
      containerType: value,
      updatedAt: Date.now(),
    });
  }
</script>

<div class="flex flex-col text-xs">
  {#if !activePage}
    <p class="p-3 opacity-50">Select a page to edit its properties.</p>
  {:else}
    <div class="p-3 flex flex-col gap-3">
      <div class="flex items-center justify-between gap-2">
        <div class="min-w-0">
          <div class="font-semibold truncate">{pageName || pageId}</div>
          <div class="opacity-50 truncate">
            {`/${pageName}`}
          </div>
        </div>
      </div>

      <label class="flex flex-col gap-1">
        <span class="opacity-60">Name</span>
        <input class="input h-7 py-0 px-2" bind:value={name} onblur={saveName} />
      </label>

      <label class="flex flex-col gap-1">
        <span class="opacity-60">Container</span>
        <select
          class="input h-7 py-0 px-1"
          value={containerType}
          onchange={(event) => saveContainer(event.currentTarget.value as ContainerType)}
        >
          {#each containerOptions as option}
            <option value={option}>{option}</option>
          {/each}
        </select>
      </label>
    </div>
  {/if}
</div>
