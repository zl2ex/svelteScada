<script lang="ts">
  import { PlusIcon, SaveIcon, Trash2Icon } from "@lucide/svelte";
  import { getEditorContext } from "$lib/client/editor/editorContext";
  import { getAbilityContext } from "$lib/client/permissions/abilityContext";
  import { toast } from "$lib/client/toast.svelte";
  import { DEFAULT_THEME_BODY, DEFAULT_THEME_NAME } from "$lib/themes/defaultThemeCss";
  import { enforceThemeCss, wrapThemeCss } from "$lib/themes/css";
  import { newId } from "$lib/util/newId";
  import CssEditor from "$lib/client/componets/editor/CssEditor.svelte";

  const editor = getEditorContext();
  const ability = getAbilityContext();

  let selectedId = $state<string | null>(null);
  let nameDraft = $state("");
  let cssDraft = $state("");

  let themes = $derived(editor.themes);
  let selected = $derived(selectedId ? editor.userThemesCollection.state[selectedId] : undefined);

  $effect(() => {
    if (selectedId && !editor.userThemesCollection.state[selectedId]) {
      selectedId = themes[0]?.id ?? null;
    }
    if (!selectedId && themes[0]) {
      selectedId = themes[0].id;
    }
  });

  $effect(() => {
    nameDraft = selected?.name ?? "";
    cssDraft = selected?.projectStyle ?? "";
  });

  function uniqueThemeName() {
    let index = themes.length + 1;
    let name = `theme-${index}`;
    while (themes.some((theme) => theme.name === name)) {
      index++;
      name = `theme-${index}`;
    }
    return name;
  }

  function createTheme() {
    const name = uniqueThemeName();
    const id = newId();
    const now = Date.now();
    editor.userThemesCollection.add({
      id,
      name,
      projectStyle: wrapThemeCss(name, DEFAULT_THEME_BODY),
      createdAt: now,
      updatedAt: now,
    });
    selectedId = id;
    toast({ kind: "success", title: "Theme created", description: name });
  }

  function saveTheme() {
    if (!selected) return;
    const name = nameDraft.trim();
    if (!name) {
      toast({ kind: "error", title: "Theme name is required" });
      return;
    }

    editor.userThemesCollection.update(selected.id, {
      name,
      projectStyle: enforceThemeCss(name, cssDraft),
      updatedAt: Date.now(),
    });
    toast({ kind: "success", title: "Theme saved", description: name });
  }

  function deleteTheme() {
    if (!selected) return;
    const id = selected.id;
    editor.userThemesCollection.remove(id);
    for (const project of editor.projects) {
      if (project.themeId === id) project.themeId = null;
    }
    toast({ kind: "info", title: "Theme deleted", description: selected.name });
  }

  function resetDrafts() {
    nameDraft = selected?.name ?? "";
    cssDraft = selected?.projectStyle ?? "";
  }
</script>

<div class="flex h-full min-h-0 flex-col p-3 text-xs">
  <header class="mb-3 flex items-center justify-between gap-3">
    <div>
      <h1 class="h2">Themes</h1>
      <p class="opacity-60">Global CSS themes. Edit the complete CSS file for the theme.</p>
    </div>
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="btn btn-sm preset-tonal"
        disabled={!ability.can("update", "Project")}
        onclick={createTheme}
      >
        <PlusIcon class="size-4" />
        New theme
      </button>
    </div>
  </header>

  {#if editor.userThemesCollection.syncError}
    <p class="mb-2 rounded border border-error-400-600/40 bg-error-500/10 p-2 text-error-400-600">
      {JSON.stringify(editor.userThemesCollection.syncError)}
    </p>
  {/if}

  <div class="grid min-h-0 flex-1 grid-cols-[14rem_minmax(0,1fr)] gap-3">
    <aside class="min-h-0 overflow-y-auto rounded border border-surface-200-800 p-1">
      {#if themes.length === 0}
        <p class="p-2 opacity-60">No themes.</p>
      {:else}
        {#each themes as theme (theme.id)}
          <button
            type="button"
            class="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left hover:opacity-70"
            class:bg-primary-200-800={selectedId === theme.id}
            onclick={() => (selectedId = theme.id)}
          >
            <span class="truncate">{theme.name}</span>
            {#if theme.name === DEFAULT_THEME_NAME}
              <span class="text-[10px] uppercase opacity-50">default</span>
            {/if}
          </button>
        {/each}
      {/if}
    </aside>

    <section class="flex min-h-0 min-w-0 flex-col gap-2">
      {#if !selected}
        <p class="opacity-60">Select or create a theme.</p>
      {:else}
        <fieldset
          class="flex min-h-0 flex-1 flex-col gap-2"
          disabled={!ability.can("update", "Project")}
        >
          <label for={`themeName-${selected.id}`} class="opacity-60">Name / data-theme</label>
          <div class="flex items-center gap-4">
            <input id={`themeName-${selected.id}`} class="input py-1" bind:value={nameDraft} />
            <button
              type="button"
              class="btn btn-sm preset-filled"
              onclick={saveTheme}
              title="Save theme"
            >
              <SaveIcon class="size-4" />
              Save
            </button>
            <button
              type="button"
              class="btn btn-sm preset-tonal"
              onclick={resetDrafts}
              title="Discard changes"
            >
              Discard
            </button>
            <button
              type="button"
              class="btn btn-sm preset-tonal text-error-400-600"
              onclick={deleteTheme}
              title="Delete theme"
            >
              <Trash2Icon class="size-4" />
            </button>
          </div>

          <div class="min-h-0 flex-1">
            <CssEditor
              value={cssDraft}
              height="calc(100vh - 14rem)"
              ariaLabel={`CSS for ${selected.name}`}
              onchange={(value) => (cssDraft = value)}
            />
          </div>
        </fieldset>
      {/if}
    </section>
  </div>
</div>
