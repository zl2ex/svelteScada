<script lang="ts">
  import TreeNode from "./TreeNode.svelte";
  import { ClientTag } from "../tag/tagState.svelte";
  import { socketIoClientHandler } from "../socket.io/socket.io.svelte";
  import { error } from "@sveltejs/kit";

  type props = {
    path: string;
    onclick?: (path: string) => void;
  };

  let { path, onclick }: props = $props();
</script>

<svelte:boundary>
  {#await socketIoClientHandler.rpc( { name: "getChildrenAsNode()", parameters: { path: path } } ) then response}
    {#if response.error}
      <p>{response.error.message}</p>
    {:else}
      {#each response.data as node}
        {#if node.type == "Folder"}
          <details>
            <summary>{node.name}</summary>
            <div class="indent">
              <TreeNode path={node.path} {onclick}></TreeNode>
            </div>
          </details>
        {:else if node.type == "Tag"}
          <summary
            tabindex="0"
            onclick={() => {
              if (onclick) {
                onclick(node.path);
              }
            }}>T: {node.name}</summary
          >
        {/if}
      {/each}
    {/if}
  {:catch error}
    <p>async catch error {error}</p>
  {/await}
  {#snippet pending()}
    <p>loading...</p>
  {/snippet}
  {#snippet failed(error, reset)}
    <p>{error}</p>
    <button onclick={reset} class="primary">oops! try again</button>
  {/snippet}
</svelte:boundary>

<style>
  .indent {
    margin-left: 0.55rem;
    padding-left: 0.25rem;
    border-left: 0.1rem solid var(--app-text-color);
  }

  details {
    cursor: pointer;
  }

  summary {
    padding: 0.25rem;
    /*list-style-position: outside;*/
  }
</style>
