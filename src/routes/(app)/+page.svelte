<script lang="ts">
  import { BlocksIcon, PenIcon } from "@lucide/svelte";

  let { data } = $props();
</script>

<div class="mx-auto w-240">
  <div class="flex gap-4 items-center">
    <img src="/images/svelte-logo.svg" class="size-16" />
    <h1 class="h1 py-10 font-light tracking-wide">SVELTE SCADA</h1>
  </div>
  <div class="flex items-center justify-between gap-4 py-6">
    <h2 class="h2 font-light tracking-wide">Projects</h2>
    <a class="btn preset-tonal" href="/editor">
      <PenIcon class="size-4" />
      Editor
    </a>
  </div>

  {#if data.projects.length === 0}
    <p class="mt-6 opacity-70">No projects found.</p>
  {:else}
    {#each data.projects as project (project.id)}
      <div
        class="flex items-center gap-4 p-2 rounded-sm hover:bg-surface-200-800 active:bg-surface-200-800"
      >
        <BlocksIcon class="size-4 opacity-70" />
        <a class="" href={`/${project.name}`}>{project.name}</a>
        {#if project.description}
          <span class="ml-2 text-sm opacity-60">{project.description}</span>
        {/if}
      </div>
    {/each}
  {/if}
</div>
