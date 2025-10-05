<script lang="ts">
  import TagViewer from "$lib/client/componets/scada/TagViewer.svelte";
  import TagEditor from "$lib/client/componets/TagEditor.svelte";
  import TreeNode from "$lib/client/componets/TreeNode.svelte";

  let tagEditorPath = $state("");
</script>

<div id="page">
  <div id="treeBrowser">
    <input type="text" bind:value={tagEditorPath} />
    <svelte:boundary>
      <TreeNode path={""} onclick={(path) => (tagEditorPath = path)}></TreeNode>

      {#snippet pending()}
        <p>loading...</p>
      {/snippet}
      {#snippet failed(error, reset)}
        <p>{error}</p>
        <button onclick={reset} class="primary">oops! try again</button>
      {/snippet}
    </svelte:boundary>
  </div>
  <div id="tagEditor">
    <TagViewer tagPath={tagEditorPath}></TagViewer>
  </div>
</div>

<style>
  #page {
    display: flex;
    flex-direction: row;
    overflow: hidden;
  }
  #treeBrowser {
    flex-grow: 0;
    height: var(
      --app-main-content-height
    ); /*space for the header  has to have a height for overflow-y: auto*/
    overflow-y: auto;
    width: fit-content;
    background-color: var(--app-color-neutral-500);
    padding-left: 0.5rem;
    padding-right: 0.5rem;
  }

  #tagEditor {
    flex-grow: 1;
    height: var(
      --app-main-content-height
    ); /*space for the header  has to have a height for overflow-y: auto*/
  }
</style>
