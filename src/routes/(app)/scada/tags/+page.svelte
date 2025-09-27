<script lang="ts">
  import TagViewer from "$lib/client/componets/scada/TagViewer.svelte";
  import { ClientTag } from "$lib/client/tag/tagState.svelte";
</script>

<div>
  <p>Tags</p>

  <svelte:boundary>
    {#each await ClientTag.getTagPathsByPath("/demo/**") as tagPath}
      <TagViewer {tagPath}></TagViewer>
    {/each}

    {#snippet pending()}
      <p>loading...</p>
    {/snippet}
    {#snippet failed(error, reset)}
      <p>{error}</p>
      <button onclick={reset} class="primary">oops! try again</button>
    {/snippet}
  </svelte:boundary>
</div>

<style>
</style>
