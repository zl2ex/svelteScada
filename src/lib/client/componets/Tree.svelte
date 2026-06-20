<script lang="ts">
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
  import { TagNode } from "../tag/clientTag.svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";
  import Label from "./scada/TagInput.svelte";

  type props = {
    nodes: TagNode[];
    loadChildren?: TreeViewRootProps["loadChildren"];
    fileAttributes?: HTMLButtonAttributes;
    folderAttributes?: HTMLButtonAttributes;
  };

  let { nodes, loadChildren, fileAttributes, folderAttributes }: props =
    $props();

  let collection = $derived(
    createTreeViewCollection<TagNode>({
      nodeToValue: (node) => node.path,
      nodeToString: (node) => node.name,
      rootNode: {
        path: "root",
        name: "",
        parentPath: "/",
        type: "Folder",
        children: nodes,
      },
    }),
  );

  /*
	const loadChildren: TreeViewRootProps['loadChildren'] = async (details) => {
		await new Promise((resolve) => setTimeout(resolve, 1000));
		return response[details.node.id] || [];
	};
	*/

  const onLoadChildrenComplete: TreeViewRootProps["onLoadChildrenComplete"] = (
    details,
  ) => {
    collection = details.collection;
  };
</script>

<TreeView
  {collection}
  {loadChildren}
  {onLoadChildrenComplete}
  selectionMode="multiple"
>
  <!--<TreeView.Label>File System</TreeView.Label>-->
  <TreeView.Tree>
    {#each collection.rootNode.children || [] as node, index (node)}
      {@render treeNode(node, [index])}
    {/each}
  </TreeView.Tree>
</TreeView>

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
            <TreeView.BranchText {...fileAttributes}>
              <TagsIcon class="size-4" />
              {node.name}
            </TreeView.BranchText>
          {:else}
            <TreeView.BranchText {...folderAttributes}>
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
        <TreeView.Item {...fileAttributes}>
          <TagIcon class="size-4" />
          <div class="cont">
            {node.name}
            <Label path={node.path}></Label>
          </div>
        </TreeView.Item>
        <!--render normal file icon plus name-->
      {:else}
        <TreeView.Item {...fileAttributes}>
          <FileIcon class="size-4" />
          {node.name}
        </TreeView.Item>
      {/if}
    {/if}
  </TreeView.NodeProvider>
{/snippet}

<style>
  .cont {
    display: flex;
    flex-grow: 1;
    align-items: center;
    justify-content: space-between;
  }
</style>
