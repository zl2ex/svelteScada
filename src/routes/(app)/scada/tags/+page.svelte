<script lang="ts">
  import TagViewer from "$lib/client/componets/scada/TagViewer.svelte";

  let { data } = $props();
</script>

<div>
  {#each data.tagPaths as tagPath}
    <TagViewer {tagPath}></TagViewer>
  {/each}
</div>

<style>
</style>
