<script lang="ts">
  import { getEditorContext } from "$lib/client/editor/editorContext";
  import PageCanvas from "./PageCanvas.svelte";
  import { themeStyleTag } from "$lib/themes/css";

  const editor = getEditorContext();

  let page = $derived(editor.activePage);
  let elements = $derived(editor.elementsCollection?.state ?? null);
  let theme = $derived(editor.activeTheme);
</script>

<svelte:head>
  {#if theme}
    {@html themeStyleTag(theme.projectStyle)}
  {/if}
</svelte:head>

{#if page && elements}
  <PageCanvas
    {elements}
    containerType={page.containerType}
    mode={editor.mode}
    themeName={theme?.name}
  />
{/if}
