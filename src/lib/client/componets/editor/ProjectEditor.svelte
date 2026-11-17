<script lang="ts">
  import { getEditorContext } from "$lib/client/editor/editorContext";
  import { getAbilityContext } from "$lib/client/permissions/abilityContext";
  import { toast } from "$lib/client/toast.svelte";
  import { z_ProjectInsert, type ProjectSelect } from "$lib/sqlite/tables";

  const editor = getEditorContext();
  const ability = getAbilityContext();

  let project = $derived(
    editor.selectedProjectId ? editor.projects.state[editor.selectedProjectId] : null,
  );

  let name = $state("");
  let version = $state("");
  let description = $state("");
  let themeId = $state("");
  let gridEnabled = $state(true);
  let gridSpacing = $state(5);

  function resetDrafts() {
    if (!project) return;
    name = project.name;
    version = project.version;
    description = project.description ?? "";
    themeId = project.themeId ?? "";
    gridEnabled = project.grid_enabled;
    gridSpacing = project.grid_spacing;
  }

  function saveChanges(changes: Partial<ProjectSelect>) {
    if (!project) return;

    const updatedAt = Date.now();
    const next = { ...project, ...changes, updatedAt };
    const parsed = z_ProjectInsert.safeParse(next);
    if (!parsed.success) {
      toast({
        kind: "error",
        title: "Invalid project",
        description: parsed.error.message,
        duration: 4000,
      });
      resetDrafts();
      return;
    }

    editor.projects.update(project.id, { ...changes, updatedAt });
  }

  function saveName() {
    if (!project) return;
    const value = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-");
    name = value;
    if (!value) {
      resetDrafts();
      return;
    }
    if (value === project.name) return;
    saveChanges({ name: value });
  }

  function saveVersion() {
    if (!project || version === project.version) return;
    saveChanges({ version: version.trim() || "0.0.0" });
  }

  function saveDescription() {
    if (!project) return;
    const value = description.trim() === "" ? null : description;
    if (value === project.description) return;
    saveChanges({ description: value });
  }

  function saveTheme(value: string) {
    if (!project) return;
    themeId = value;
    saveChanges({ themeId: value || null });
  }

  function saveGridEnabled(value: boolean) {
    if (!project) return;
    gridEnabled = value;
    saveChanges({ grid_enabled: value });
  }

  function saveGridSpacing(value: string) {
    if (!project) return;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
      resetDrafts();
      return;
    }
    const spacing = Math.max(1, Math.min(200, parsed));
    gridSpacing = spacing;
    if (spacing === project.grid_spacing) return;
    saveChanges({ grid_spacing: spacing });
  }

  $effect(() => {
    if (project) resetDrafts();
  });
</script>

<div class="flex flex-col text-xs">
  <fieldset class="contents" disabled={!ability.can("update", "Project")}>
    {#if !project}
      <p class="p-3 opacity-50">Select a project to edit its properties.</p>
    {:else}
      <div class="p-3 flex flex-col gap-3">
        <div class="min-w-0">
          <div class="font-semibold truncate">{project.name}</div>
          <div class="opacity-50 truncate">Project · {project.id}</div>
        </div>

        <label class="flex flex-col gap-1">
          <span class="opacity-60">Name</span>
          <input class="input h-7 px-1" bind:value={name} onchange={saveName} />
        </label>

        <label class="flex flex-col gap-1">
          <span class="opacity-60">Version</span>
          <input class="input h-7 px-1" bind:value={version} onchange={saveVersion} />
        </label>

        <label class="flex flex-col gap-1">
          <span class="opacity-60">Description</span>
          <textarea
            class="textarea px-1"
            rows="3"
            bind:value={description}
            onchange={saveDescription}
          ></textarea>
        </label>

        <label class="flex flex-col gap-1">
          <span class="opacity-60">Theme</span>
          <select
            class="select h-7 py-0 px-1"
            value={themeId}
            onchange={(event) => saveTheme(event.currentTarget.value)}
          >
            <option value="">Default fallback</option>
            {#each editor.themes as theme (theme.id)}
              <option value={theme.id}>{theme.name}</option>
            {/each}
          </select>
        </label>

        <label class="flex items-center justify-between gap-2">
          <span class="opacity-60">Grid enabled</span>
          <input
            type="checkbox"
            class="checkbox"
            checked={gridEnabled}
            onchange={(event) => saveGridEnabled(event.currentTarget.checked)}
          />
        </label>

        <label class="flex items-center justify-between gap-2">
          <span class="opacity-60">Grid spacing</span>
          <input
            class="input h-7 w-20 px-1"
            type="number"
            min="1"
            max="200"
            value={gridSpacing}
            onchange={(event) => saveGridSpacing(event.currentTarget.value)}
          />
        </label>

        <div class="mt-2 flex flex-col gap-1 border-t border-surface-200-800 pt-2 opacity-60">
          <div>ID: {project.id}</div>
          <div>Created: {new Date(project.createdAt).toLocaleString()}</div>
          <div>Updated: {new Date(project.updatedAt).toLocaleString()}</div>
        </div>
      </div>
    {/if}
  </fieldset>
</div>
