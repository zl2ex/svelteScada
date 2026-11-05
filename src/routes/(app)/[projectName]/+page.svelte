<script lang="ts">
  import { getAbilityContext } from "$lib/client/permissions/abilityContext";
  import { toast } from "$lib/client/toast.svelte";
  import { setProjectTheme } from "$live/user-theme";
  import { attempt } from "$lib/util/attempt";
  import { errorToString, neverThrowErrorToString } from "$lib/util/neverThrow";

  let { data } = $props();

  const ability = getAbilityContext();
  let selectedThemeId = $state(data.project.themeId ?? data.themes[0]?.id ?? "");

  async function saveTheme(value: string) {
    selectedThemeId = value;
    const saved = await attempt(() =>
      setProjectTheme({ projectId: data.project.id, themeId: value || null }),
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
    }
  }
</script>

<div class="mx-auto max-w-3xl p-6">
  <a class="anchor text-sm" href="/">← Projects</a>
  <h1 class="h1 mt-4">{data.project.name}</h1>
  {#if data.project.description}
    <p class="mt-2 opacity-70">{data.project.description}</p>
  {/if}

  <label class="mt-6 flex max-w-md flex-col gap-1 text-sm">
    <span class="opacity-60">Theme</span>
    <select
      class="select h-8 py-0 px-2"
      value={selectedThemeId}
      disabled={!ability.can("update", "Project")}
      onchange={(event) => void saveTheme(event.currentTarget.value)}
    >
      <option value="">Default fallback</option>
      {#each data.themes as theme (theme.id)}
        <option value={theme.id}>{theme.name}</option>
      {/each}
    </select>
  </label>

  <h2 class="h2 mt-8 mb-3">Pages</h2>
  {#if data.pages.length === 0}
    <p class="opacity-70">This project has no pages.</p>
  {:else}
    <ul class="space-y-2">
      {#each data.pages as page (page.id)}
        <li>
          <a class="anchor" href={`/${data.project.name}/${page.name}`}>{page.name}</a>
        </li>
      {/each}
    </ul>
  {/if}
</div>
