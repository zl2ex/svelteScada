<script lang="ts">
  import { getEditorContext } from "$lib/client/editor/editorContext";
  import PageCanvas from "./PageCanvas.svelte";

  const editor = getEditorContext();

  let page = $derived(editor.activePage);
  let elements = $derived(editor.elementsCollection?.state ?? null);
</script>

{#if page && elements}
  <PageCanvas {elements} containerType={page.containerType} mode={editor.mode} />
{/if}
