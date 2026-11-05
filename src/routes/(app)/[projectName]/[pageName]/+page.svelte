<script lang="ts">
  import PageCanvas from "$lib/client/componets/editor/PageCanvas.svelte";
  import { themeStyleTag } from "$lib/themes/css";

  let { data } = $props();
</script>

<svelte:head>
  {#if data.theme}
    {@html themeStyleTag(data.theme.projectStyle)}
  {/if}
</svelte:head>

<div class="h-svh">
  <PageCanvas
    elements={data.elements}
    containerType={data.page.containerType}
    mode="preview"
    userComponents={data.userComponents}
    themeName={data.theme?.name}
  />
</div>
