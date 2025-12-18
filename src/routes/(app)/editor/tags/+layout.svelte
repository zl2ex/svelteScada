<script lang="ts">
  import TreeNode from "$lib/client/componets/TreeNode.svelte";
  let { children } = $props();
</script>

<div id="page">
  <div id="treeBrowser">
    <!--<input type="text" bind:value={tagEditorPath} />-->
    <svelte:boundary>
      <TreeNode path="/"></TreeNode>

      {#snippet pending()}
        <p>loading...</p>
      {/snippet}
      {#snippet failed(error, reset)}
        <p>{error}</p>
        <button onclick={reset} class="primary">oops! try again</button>
      {/snippet}
    </svelte:boundary>
  </div>

  {@render children()}
</div>

<style>
  #page {
    display: flex;
  }

  #treeBrowser {
    flex-shrink: 0;
    height: var(
      --app-main-content-height
    ); /*space for the header  has to have a height for overflow-y: auto*/
    overflow-y: auto;
    overflow-x: hidden;
    background-color: var(--app-color-neutral-400);
    padding-left: 0.5rem;
    padding-right: 0.5rem;
  }
</style>
