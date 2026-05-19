<script lang="ts">
  import { goto } from "$app/navigation";
  import Label from "$lib/client/componets/scada/Label.svelte";
  import { TagNode } from "$lib/client/tag/clientTag.svelte";
  import { getAllChildrenAsNode } from "$lib/remote/tags.remote";
  import {
    FileIcon,
    FolderIcon,
    LoaderIcon,
    TagIcon,
    TagsIcon,
  } from "@lucide/svelte";
  import {
    TreeView,
    createTreeViewCollection,
    type TreeViewRootProps,
  } from "@skeletonlabs/skeleton-svelte";

  let { children } = $props();

  let collection = $derived(
    createTreeViewCollection<TagNode>({
      nodeToValue: (node) => node.path,
      nodeToString: (node) => node.name,
      rootNode: {
        path: "root",
        name: "",
        parentPath: "/",
        type: "Folder",
        children: await getAllChildrenAsNode("/"),
      },
    }),
  );

  const onLoadChildrenComplete: TreeViewRootProps["onLoadChildrenComplete"] = (
    details,
  ) => {
    collection = details.collection;
  };
</script>

{#snippet treeNode(node: TagNode, indexPath: number[])}
  <TreeView.NodeProvider value={{ node, indexPath }}>
    {#if node.children || node.type == "Folder" || node.type == "UdtTag"}
      <TreeView.Branch>
        <TreeView.BranchControl>
          <TreeView.BranchIndicator class="data-loading:hidden" />
          <TreeView.BranchIndicator
            class="hidden data-loading:inline animate-spin"
          >
            <LoaderIcon class="size-4" />
          </TreeView.BranchIndicator>
          {#if node.type == "UdtTag"}
            <TreeView.BranchText onclick={() => goto(`?tagPath=${node.path}`)}>
              <TagsIcon class="size-4" />
              {node.name}
            </TreeView.BranchText>
          {:else}
            <TreeView.BranchText>
              <FolderIcon class="size-4" />
              {node.name}
            </TreeView.BranchText>
          {/if}
        </TreeView.BranchControl>
        <TreeView.BranchContent>
          <TreeView.BranchIndentGuide />
          {#each node.children ?? [] as childNode, childIndex (childNode)}
            {@render treeNode(childNode, [...indexPath, childIndex])}
          {/each}
        </TreeView.BranchContent>
      </TreeView.Branch>
    {:else}
      <!--specific type passed then render tag or udt tag-->
      {#if node?.type == "Tag"}
        <TreeView.Item onclick={() => goto(`?tagPath=${node.path}`)}>
          <TagIcon class="size-4" />
          <div class="flex justify-between">
            {node.name}
            <Label
              path={node.path}
              label=""
              attributes={{
                onclick: (ev) => ev.stopPropagation(),
                onkeydown: (ev) => ev.stopPropagation(),
              }}
            ></Label>
          </div>
        </TreeView.Item>
        <!--render normal file icon plus name-->
      {:else}
        <TreeView.Item>
          <FileIcon class="size-4" />
          {node.name}
        </TreeView.Item>
      {/if}
    {/if}
  </TreeView.NodeProvider>
{/snippet}

<div class="flex">
  <div class="text-sm">
    <!--<input type="text" bind:value={tagEditorPath} />-->
    <svelte:boundary>
      <TreeView {collection} {onLoadChildrenComplete} selectionMode="multiple">
        <!--<TreeView.Label>File System</TreeView.Label>-->
        <TreeView.Tree>
          {#each collection.rootNode.children || [] as node, index (node)}
            {@render treeNode(node, [index])}
          {/each}
        </TreeView.Tree>
      </TreeView>

      {#snippet pending()}
        <LoaderIcon class="size-4 animate-spin" />
      {/snippet}
      {#snippet failed(error, reset)}
        <p>{error}</p>
        <button onclick={reset} class="btn preset-filled"
          >oops! try again</button
        >
      {/snippet}
    </svelte:boundary>
  </div>

  {@render children()}
</div>
