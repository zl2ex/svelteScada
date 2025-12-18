<script lang="ts">
  import TreeNode from "./TreeNode.svelte";
  import { socketIoClientHandler } from "../socket.io/socket.io.svelte";
  import Label from "./scada/Label.svelte";
  import { goto } from "$app/navigation";
  import { getChildrenAsNode } from "$lib/remote/tags.remote";

  type props = {
    path: string;
  };

  let { path }: props = $props();
</script>

<svelte:boundary>
  <!--{#await socketIoClientHandler.rpc( { name: "getChildrenAsNode()", parameters: { path: path } } ) then response}-->
  {#await getChildrenAsNode(path) then response}
    <!--{#if response.error}
      <p>{response.error.message}</p>
    {:else}-->
    {#each response as node}
      {#if node.type == "Folder"}
        <details open>
          <summary>{node.name}</summary>
          <div class="indent">
            <button
              onclick={() => goto(`?tagPath=newTag&parentPath=${node.path}`)}
              >+ new Tag</button
            >
            <TreeNode path={node.path}></TreeNode>
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
            <Label path={node.path} onclick={(ev) => ev.stopPropagation()}
            ></Label>
          </div>
        </summary>
      {:else if node.type == "UdtTag"}
        <details open>
          <summary tabindex="0">
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
            <TreeNode path={node.path}></TreeNode>
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
</svelte:boundary>

<style>
  .indent {
    margin-left: 0.55rem;
    padding-left: 0.25rem;
    border-left: 0.1rem solid var(--app-text-color);
  }

  details {
    position: relative;
    cursor: pointer;
  }

  summary {
    padding: 0.25rem;
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
