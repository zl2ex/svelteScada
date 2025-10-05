<script lang="ts">
  import TreeNode from "./TreeNode.svelte";
  import { ClientTag } from "../tag/tagState.svelte";
  import type { MouseEventHandler } from "svelte/elements";

  type props = {
    path: string;
    onclick?: (path: string) => void;
  };

  let { path, onclick }: props = $props();
</script>

<svelte:boundary>
  {#each await ClientTag.getChildrenAsNode(path) as node}
    {#if node.type == "Folder"}
      <details>
        <summary>{node.name}</summary>
        <div class="indent">
          <TreeNode path={node.path} {onclick}></TreeNode>
        </div>
      </details>
    {:else if node.type == "Tag"}
      <summary
        onclick={() => {
          if (onclick) {
            onclick(node.path);
          }
        }}>T: {node.name}</summary
      >
    {/if}
  {/each}
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
  }
</style>
