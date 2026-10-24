<script lang="ts">
  import { FilePlus2 } from "@lucide/svelte";
  import PageCanvasEditor from "$lib/client/componets/editor/PageCanvasEditor.svelte";

  let { data } = $props();
</script>

{#if data.activePageId && data.page}
  {#key data.activePageId}
    <PageCanvasEditor pageId={data.activePageId} page={data.page} elements={data.elements} />
  {/key}
{:else}
  <div class="flex h-full items-center justify-center p-6">
    <div class="card p-6 max-w-md text-center text-sm">
      <FilePlus2 class="size-10 mx-auto mb-3 opacity-50" />
      <h2 class="font-semibold mb-1">No page open</h2>
      <p class="opacity-60">Open the Pages tab on the left to create or select a page.</p>
    </div>
  </div>
{/if}
