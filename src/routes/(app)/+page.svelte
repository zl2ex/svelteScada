<script lang="ts">
  let { data } = $props();
</script>

<div class="mx-auto max-w-3xl p-6">
  <div class="flex items-center justify-between gap-4">
    <h1 class="h1">Projects</h1>
    <a class="btn preset-tonal" href="/editor">Editor</a>
  </div>

  {#if data.projects.length === 0}
    <p class="mt-6 opacity-70">No projects found.</p>
  {:else}
    <ul class="mt-6 space-y-2">
      {#each data.projects as project (project.id)}
        <li>
          <a class="anchor" href={`/${project.name}`}>{project.name}</a>
          {#if project.description}
            <span class="ml-2 text-sm opacity-60">{project.description}</span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>
