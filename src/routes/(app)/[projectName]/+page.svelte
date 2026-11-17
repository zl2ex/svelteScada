<script lang="ts">
  let { data } = $props();
</script>

<div class="mx-auto max-w-3xl p-6">
  <a class="anchor text-sm" href="/">← Projects</a>
  <h1 class="h1 mt-4">{data.project.name}</h1>
  {#if data.project.description}
    <p class="mt-2 opacity-70">{data.project.description}</p>
  {/if}

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
