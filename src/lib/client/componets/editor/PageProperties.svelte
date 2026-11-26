<script lang="ts">
  import { getEditorContext } from "$lib/client/editor/editorContext";
  import { getAbilityContext } from "$lib/client/permissions/abilityContext";
  import { commitOrRevert } from "$lib/client/util/use";

  const editor = getEditorContext();
  const ability = getAbilityContext();

  let name = $state("");
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
  });

  function saveProjectTheme(value: string) {
    if (!activeProject) return;
    projectThemeId = value;
    editor.projects.update(activeProject.id, {
      themeId: value || null,
      updatedAt: Date.now(),
    });
  }

  function saveName() {
    if (!activePage) return;
    editor.pagesCollection.update(activePage.id, { name, updatedAt: Date.now() });
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
        <input
          class="input h-7 py-0 px-2"
          bind:value={name}
          {@attach commitOrRevert(() => saveName())}
        />
      </label>

      <label class="flex flex-col gap-1">
        <span class="opacity-60">Project theme</span>
        <select
          class="select h-7 py-0 px-1"
          value={projectThemeId}
          disabled={!ability.can("update", "Project")}
          {@attach commitOrRevert((value) => void saveProjectTheme(value))}
        >
          <option value="">Default fallback</option>
          {#each editor.themes as theme (theme.id)}
            <option value={theme.id}>{theme.name}</option>
          {/each}
        </select>
      </label>

    </div>
  {/if}
</div>
