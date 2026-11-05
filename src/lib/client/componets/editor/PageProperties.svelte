<script lang="ts">
  import { getEditorContext } from "$lib/client/editor/editorContext";
  import { getAbilityContext } from "$lib/client/permissions/abilityContext";
  import { toast } from "$lib/client/toast.svelte";
  import { setProjectTheme } from "$live/user-theme";
  import { attempt } from "$lib/util/attempt";
  import { errorToString, neverThrowErrorToString } from "$lib/util/neverThrow";
  import type { ContainerType } from "$lib/elements/elementTypes";

  const editor = getEditorContext();
  const ability = getAbilityContext();
  const containerOptions: ContainerType[] = ["none", "absolute", "flex", "grid", "block"];

  let name = $state("");
  let containerType = $state<ContainerType>("none");
  let projectThemeId = $state("");
  let activeProject = $derived(editor.activeProject);
  let activePage = $derived(editor.activePage);
  let pageName = $derived(activePage?.name ?? "");
  let pageId = $derived(activePage?.id ?? "");

  $effect(() => {
    projectThemeId = activeProject?.themeId ?? editor.themes[0]?.id ?? "";
  });

  $effect(() => {
    if (!activePage) return;
    name = activePage.name;
    containerType = activePage.containerType;
  });

  async function saveProjectTheme(value: string) {
    if (!activeProject) return;
    projectThemeId = value;
    const saved = await attempt(() =>
      setProjectTheme({ projectId: activeProject.id, themeId: value || null }),
    );
    if (saved.isErr) {
      toast({
        kind: "error",
        title: "Theme save failed",
        description: errorToString(saved.error),
        duration: 4000,
      });
      return;
    }
    if (saved.data.isErr) {
      toast({
        kind: "error",
        title: "Theme save failed",
        description: neverThrowErrorToString(saved.data.error),
        duration: 4000,
      });
      return;
    }
    activeProject.themeId = value || null;
  }

  function saveName() {
    if (!activePage) return;
    editor.pagesCollection.update(activePage.id, { name, updatedAt: Date.now() });
  }

  function saveContainer(value: ContainerType) {
    if (!activePage) return;
    containerType = value;
    editor.pagesCollection.update(activePage.id, {
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
        <span class="opacity-60">Project theme</span>
        <select
          class="select h-7 py-0 px-1"
          value={projectThemeId}
          disabled={!ability.can("update", "Project")}
          onchange={(event) => void saveProjectTheme(event.currentTarget.value)}
        >
          <option value="">Default fallback</option>
          {#each editor.themes as theme (theme.id)}
            <option value={theme.id}>{theme.name}</option>
          {/each}
        </select>
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
