<script lang="ts">
  import TreeNode from "./TreeNode.svelte";
  import { goto } from "$app/navigation";
  import { getAllChildrenAsNode } from "$lib/remote/tags.remote";
  import type { TagNode } from "../tag/clientTag.svelte";
  import type { Snippet } from "svelte";

  type pathProvided = {
    path: string;
    nodes?: never;
    getChildren?: (node: TagNode) => Promise<TagNode[]>;
    s?: {
      folder: { details?: Snippet<[TagNode]>; summary?: Snippet<[TagNode]> };
      tag: { details?: Snippet<[TagNode]>; summary?: Snippet<[TagNode]> };
      udtTag: { details?: Snippet<[TagNode]>; summary?: Snippet<[TagNode]> };
    };
  };

  type nodesProvided = {
    path?: never;
    nodes: TagNode[];
    getChildren?: (node: TagNode) => Promise<TagNode[]>;
    s?: {
      folder: { details?: Snippet<[TagNode]>; summary?: Snippet<[TagNode]> };
      tag: { details?: Snippet<[TagNode]>; summary?: Snippet<[TagNode]> };
      udtTag: { details?: Snippet<[TagNode]>; summary?: Snippet<[TagNode]> };
    };
  };

  type props = pathProvided | nodesProvided;

  let { path, nodes, s, getChildren }: props = $props();

  let tree = $derived.by(async () => {
    if (path) {
      return await getAllChildrenAsNode(path);
    } else {
      return nodes;
    }
  });
</script>

<svelte:boundary>
  <div class="treeNode">
    <!--{#await socketIoClientHandler.rpc( { name: "getChildrenAsNode()", parameters: { path: path } } ) then response}-->
    {#await tree then response}
      <!--<pre>{JSON.stringify(nodes, null, 2)}</pre>-->
      <!--{#if response.error}
      <p>{response.error.message}</p>
      {:else}-->
      <!--<pre>{JSON.stringify(response, null, 2)}</pre>-->
      {#each response as node}
        {#if node.type == "Folder"}
          <details open>
            <summary>
              {node.name}
              {@render s.folder.summary?.(node)}
            </summary>
            <div class="indent">
              {@render s.folder.details?.(node)}
              {#if node.children}
                <TreeNode nodes={node.children} {s} {getChildren}></TreeNode>
              {:else if getChildren}
                <TreeNode nodes={await getChildren(node)} {s} {getChildren}
                ></TreeNode>
              {/if}
            </div>
          </details>
        {:else if node.type == "Tag"}
          <summary tabindex="0" onclick={() => goto(`?tagPath=${node.path}`)}>
            <div class="tag-item-container">
              <svg viewBox="0 0 100 100">
                <g
                  stroke-width="4px"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  fill="none"
                >
                  <line x1="10" y1="20" x2="70" y2="20"></line>
                  <line x1="10" y1="80" x2="70" y2="80"></line>
                  <line x1="70" y1="20" x2="90" y2="40"></line>
                  <line x1="70" y1="80" x2="90" y2="60"></line>

                  <line x1="10" y1="20" x2="10" y2="80"></line>
                  <line x1="90" y1="40" x2="90" y2="60"></line>

                  <circle r="5" cx="70" cy="50"></circle>
                </g>
              </svg>
              <span>{node.name}</span>
              {@render s.tag.summary?.(node)}
            </div></summary
          >
        {:else if node.type == "UdtTag"}
          <details open>
            <summary tabindex="0" onclick={() => goto(`?tagPath=${node.path}`)}>
              <div class="tag-item-container">
                <svg viewBox="0 0 100 100">
                  <g
                    stroke-width="4px"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    fill="none"
                  >
                    <line x1="10" y1="20" x2="70" y2="20"></line>
                    <line x1="10" y1="80" x2="70" y2="80"></line>
                    <line x1="70" y1="20" x2="90" y2="40"></line>
                    <line x1="70" y1="80" x2="90" y2="60"></line>

                    <line x1="10" y1="20" x2="10" y2="80"></line>
                    <line x1="20" y1="20" x2="20" y2="80"></line>
                    <line x1="30" y1="20" x2="30" y2="80"></line>
                    <line x1="40" y1="20" x2="40" y2="80"></line>

                    <line x1="90" y1="40" x2="90" y2="60"></line>

                    <circle r="5" cx="70" cy="50"></circle>
                  </g>
                </svg>
                <span>
                  {node.name}
                </span>
              </div>
            </summary>
            <div class="indent">
              {#if node.children}
                <TreeNode nodes={node.children} {s} {getChildren}></TreeNode>
              {:else if getChildren}
                <TreeNode nodes={await getChildren(node)} {s} {getChildren}
                ></TreeNode>
              {/if}
            </div>
          </details>
        {/if}
      {/each}
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
  </div>
</svelte:boundary>

<style>
  .treeNode {
    font-size: 0.8rem;
  }
  .indent {
    padding-left: 1rem;
    /*border-left: 0.1rem solid var(--app-text-color);*/
  }

  details {
    position: relative;
    cursor: pointer;
  }

  summary {
    padding: 0.1rem;
    border-radius: 0.2rem;
    /*list-style-position: outside;*/
  }

  .tag-item-container {
    display: flex;
    align-items: center;
    gap: 0.5ch;
  }
  svg {
    stroke: var(--app-text-color);
    fill: transparent;
    width: 1.5rem;
  }
</style>
