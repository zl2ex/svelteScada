<script lang="ts">
  import TagInput from "$lib/client/componets/scada/TagInput.svelte";
  import {
    Copy,
    FileIcon,
    FolderIcon,
    FolderPlus,
    LoaderIcon,
    Scissors,
    TagIcon,
    TagPlus,
    Trash2,
  } from "@lucide/svelte";
  import {
    Menu,
    Portal,
    TreeView,
    createTreeViewCollection,
    useTreeView,
  } from "@skeletonlabs/skeleton-svelte";

  import type { ClosureTableNode } from "$lib/server/sqlite/util/tagClosureTable.js";
  import { tryCatch } from "$lib/util/tryCatch";
  import {
    z_shared_insertTag,
    z_shared_insertTagFolder,
  } from "$lib/validation/zod";
  import { browser } from "$app/env";
  import { tagPatches, applyTagPatches } from "$live/tags";

  let { id, data, children } = $props();

  function focusOnMount(node: HTMLInputElement) {
    node.focus();
    requestAnimationFrame(() => node.select());
  }

  // tags.svelte.ts — now just a thin instantiation of the generic class
  import { tagFolderPatches, applyTagFolderPatches } from "$live/tag-folder";
  import { PatchCollection } from "$lib/client/live/patchCollection.svelte";
  import type { TagOptionsInput } from "$lib/server/tag/tag.js";
  import { onMount } from "svelte";

  let folderPatches = $state(
    new PatchCollection<ClosureTableNode>({
      initial: data.tagFolders,
      applyPatch: applyTagFolderPatches,
      subscribePatches: (notify) => {
        // adapt tagPatches' store .subscribe() to the (payload) => void shape
        const unsubscribe = tagFolderPatches.subscribe(notify);
        return unsubscribe; // svelte stores' subscribe() already returns an unsubscribe fn
      },
      maxHistory: 50,
    }),
  );

  let tagPatchesCollection = $state(
    new PatchCollection<TagOptionsInput<any>>({
      initial: data.tags,
      applyPatch: applyTagPatches,
      subscribePatches: (notify) => {
        const unsubscribe = tagPatches.subscribe(notify);
        return unsubscribe;
      },
      maxHistory: 50,
    }),
  );

  onMount(() => {
    // unmount
    return () => {
      folderPatches.dispose();
      tagPatchesCollection.dispose();
    };
  });

  let collection = $state(
    createTreeViewCollection<ClosureTableNode>({
      nodeToValue: (node) => node.id,
      nodeToString: (node) => node.name,
      nodeToChildren: (node) => {
        if (node.id === "root") {
          return Object.values(folderPatches.state).filter(
            (f) => f.parentId == undefined,
          );
        }
        return Object.values(folderPatches.state).filter(
          (f) => f.parentId == node.id,
        );
      },
      rootNode: {
        id: "root",
        name: "",
        parentId: null,
      },
    }),
  );

  let treeView = useTreeView({
    id,
    collection,
    selectionMode: "multiple",
  });

  // ── Keyboard shortcuts ────────────────────────────────

  if (browser) {
    document.addEventListener("keyup", (e) => {
      if (e.key == "z" && e.ctrlKey) folderPatches.undo();
      if (e.key == "y" && e.ctrlKey) folderPatches.redo();
    });
  }

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text);
  }

  // ── Folder operations ─────────────────────────────────

  async function folderDelete(node: ClosureTableNode) {
    let children = Object.values(folderPatches.state).filter(
      (f) => f.parentId == node.id,
    );
    children.forEach((child) => folderDelete(child));
    folderPatches.remove(node.id);
  }

  async function folderCut(node: ClosureTableNode) {
    copyToClipboard(JSON.stringify({ id: node.id, name: node.name }));
    folderDelete(node);
  }

  async function folderCopy(node: ClosureTableNode) {
    copyToClipboard(JSON.stringify({ id: node.id, name: node.name }));
  }

  // ── Tag operations ────────────────────────────────────

  function tagCopy(tag: TagOptionsInput<any>) {
    copyToClipboard(JSON.stringify(tag));
  }

  function tagCut(tag: TagOptionsInput<any>) {
    copyToClipboard(JSON.stringify(tag));
    tagPatchesCollection.remove(tag.id);
  }

  function tagDeleteNode(tag: TagOptionsInput<any>) {
    tagPatchesCollection.remove(tag.id);
  }

  // ── Inline add / rename ───────────────────────────────

  let renamingFolderId: string | null = $state(null);
  let renamingTagId: string | null = $state(null);

  function addFolder(parentNode: ClosureTableNode) {
    const newId = crypto.randomUUID();
    folderPatches.add({
      id: newId,
      name: "New Folder",
      parentId: parentNode.id,
    });
    renamingFolderId = newId;
    treeView().expand([parentNode.id]);
  }

  function addTag(parentNode: ClosureTableNode) {
    const newId = crypto.randomUUID();
    tagPatchesCollection.add({
      id: newId,
      folderId: parentNode.id ?? null,
      name: "New Tag",
      dataType: "string",
    });
    renamingTagId = newId;
    treeView().expand([parentNode.id]);
  }

  function finalizeFolderRename(id: string, newName: string) {
    if (renamingFolderId !== id) return;
    renamingFolderId = null;
    if (!newName.trim()) {
      folderPatches.remove(id);
    } else {
      folderPatches.update(id, { name: newName.trim() });
    }
  }

  function cancelFolderRename(id: string) {
    if (renamingFolderId !== id) return;
    renamingFolderId = null;
    folderPatches.remove(id);
  }

  function finalizeTagRename(id: string, newName: string) {
    if (renamingTagId !== id) return;
    renamingTagId = null;
    if (!newName.trim()) {
      tagPatchesCollection.remove(id);
    } else {
      tagPatchesCollection.update(id, { name: newName.trim() });
    }
  }

  function cancelTagRename(id: string) {
    if (renamingTagId !== id) return;
    renamingTagId = null;
    tagPatchesCollection.remove(id);
  }

  // ── Paste ─────────────────────────────────────────────

  async function handlePaste(
    e: ClipboardEvent,
    parentNode: ClosureTableNode | undefined,
    indexPath: number[],
  ) {
    const text = e.clipboardData?.getData("text/plain");
    e.stopPropagation();
    if (!text) return;

    let json = await tryCatch(JSON.parse, text);
    if (json.error) {
      throw Error(`handlePaste() `, { cause: json.error });
    }

    let tagResult = await tryCatch(z_shared_insertTag.parse, json.data);
    let folderResult = await tryCatch(
      z_shared_insertTagFolder.parse,
      json.data,
    );
    if (tagResult.error && folderResult.error) {
      throw Error(
        `handlePaste() parse into tag or folder failed, wrong format ${json.data}`,
      );
    }

    if (folderResult.data) {
      let name = folderResult.data.name;
      const newId = crypto.randomUUID();
      const children = Object.values(folderPatches.state).filter(
        (f) => f.parentId == parentNode?.id,
      );
      let count = 0;
      // incrimentally add a number to the end of pasted node if it already exists
      while (children.map((c) => c.name).includes(name)) {
        name = folderResult.data.name + count;
        count++;
      }

      folderPatches.add({ id: newId, name, parentId: parentNode?.id });
    } else if (tagResult.data) {
      const newId = crypto.randomUUID();
      tagPatchesCollection.add({
        id: newId,
        folderId: parentNode?.id ?? null,
        name: tagResult.data.name,
        dataType: tagResult.data.dataType,
        value: tagResult.data.value ?? null,
        nodeId: tagResult.data.nodeId ?? null,
        writeable: tagResult.data.writeable ?? true,
        exposeOverOpcua: tagResult.data.exposeOverOpcua ?? true,
        parameters: tagResult.data.parameters ?? null,
        updatedAt: new Date(),
      });
    }
  }
</script>

{#snippet treeNode(node: ClosureTableNode, indexPath: number[])}
  {@const children = Object.values(folderPatches.state).filter(
    (f) => f.parentId == node.id,
  )}
  {@const tags = Object.values(tagPatchesCollection.state).filter(
    (t) => t.folderId == node.id,
  )}

  <TreeView.NodeProvider value={{ node, indexPath }}>
    {#if children || tags}
      <TreeView.Branch
        onpaste={(e) => {
          e.stopPropagation();
          handlePaste(e, node, indexPath);
        }}
        oncopy={(e) => {
          e.stopPropagation();
          folderCopy(node);
        }}
        oncut={(e) => {
          e.stopPropagation();
          folderCut(node);
        }}
        onkeyup={(e) => {
          e.stopPropagation();
          if (e.key === "Delete") folderDelete(node);
          if (e.key === "f" && e.altKey) addFolder(node);
          if (e.key === "t" && e.altKey) addTag(node);
        }}
      >
        <Menu>
          <Menu.ContextTrigger>
            <TreeView.BranchControl>
              <TreeView.BranchIndicator class="data-loading:hidden" />
              <TreeView.BranchIndicator
                class="hidden data-loading:inline animate-spin"
              >
                <LoaderIcon class="size-4" />
              </TreeView.BranchIndicator>
              <TreeView.BranchText class="truncate">
                <FolderIcon class="size-4 shrink-0" />
                {#if renamingFolderId === node.id}
                  <input
                    type="text"
                    class="border-none p-0 m-0 text-inherit bg-inherit"
                    value={node.name}
                    use:focusOnMount
                    onblur={(e) =>
                      finalizeFolderRename(node.id, e.currentTarget.value)}
                    onkeydown={(e) => {
                      if (e.key === "Enter")
                        finalizeFolderRename(node.id, e.currentTarget.value);
                      if (e.key === "Escape") cancelFolderRename(node.id);
                    }}
                  />
                {:else}
                  {node.name}
                {/if}
              </TreeView.BranchText>
            </TreeView.BranchControl>
          </Menu.ContextTrigger>
          <Portal>
            <Menu.Positioner>
              <Menu.Content class="min-w-auto">
                <Menu.Item value="newTag">
                  <Menu.ItemText class="w-full">
                    <button
                      class="flex items-center gap-2 w-full"
                      onclick={() => addTag(node)}
                    >
                      <TagPlus class="size-4" />
                      <span>New Tag</span>
                      <span class="text-xs text-neutral-500 ml-auto"
                        >Ctrl+T</span
                      >
                    </button>
                  </Menu.ItemText>
                </Menu.Item>
                <Menu.Item value="newFolder">
                  <Menu.ItemText class="w-full">
                    <button
                      class="flex items-center gap-2 w-full"
                      onclick={() => addFolder(node)}
                    >
                      <FolderPlus class="size-4" />
                      <span>New Folder</span>
                      <span class="text-xs text-neutral-500 ml-auto"
                        >Ctrl+F</span
                      >
                    </button>
                  </Menu.ItemText>
                </Menu.Item>
                <Menu.Separator />
                <Menu.Item value="cut">
                  <Menu.ItemText class="w-full">
                    <button
                      class="flex items-center gap-2 w-full"
                      onclick={() => folderCut(node)}
                    >
                      <Scissors class="size-4" />
                      <span>Cut</span>
                      <span class="text-xs text-neutral-500 ml-auto"
                        >Ctrl+X</span
                      >
                    </button>
                  </Menu.ItemText>
                </Menu.Item>
                <Menu.Item value="copy">
                  <Menu.ItemText class="w-full">
                    <button
                      class="flex items-center gap-2 w-full"
                      onclick={() => folderCopy(node)}
                    >
                      <Copy class="size-4" />
                      <span>Copy</span>
                      <span class="text-xs text-neutral-500 ml-auto"
                        >Ctrl+C</span
                      >
                    </button>
                  </Menu.ItemText>
                </Menu.Item>
                <Menu.Separator />
                <Menu.Item value="delete">
                  <Menu.ItemText class="w-full">
                    <button
                      class="flex items-center gap-2 w-full"
                      onclick={() => folderDelete(node)}
                    >
                      <Trash2 class="size-4" />
                      Delete
                      <span class="text-xs text-neutral-500 ml-auto">Del</span
                      ></button
                    ></Menu.ItemText
                  >
                </Menu.Item>
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu>
        <TreeView.BranchContent>
          <TreeView.BranchIndentGuide />
          {#each children ?? [] as childNode, childIndex (childNode.id)}
            {@render treeNode(childNode, [...indexPath, childIndex])}
          {/each}
          {#if tags || (renamingTagId && tagPatchesCollection.state[renamingTagId])}
            {#each tags as tag}
              <TreeView.Item
                onkeyup={(e) => {
                  e.stopPropagation();
                  if (e.key === "Delete") tagDeleteNode(tag);
                }}
              >
                <div class="flex items-center gap-2">
                  <TagIcon class="size-4 shrink-0" />
                  {#if renamingTagId === tag.id}
                    <input
                      type="text"
                      use:focusOnMount
                      onblur={(e) =>
                        finalizeTagRename(tag.id, e.currentTarget.value)}
                      onkeydown={(e) => {
                        if (e.key === "Enter")
                          finalizeTagRename(tag.id, e.currentTarget.value);
                        if (e.key === "Escape") cancelTagRename(tag.id);
                      }}
                    />
                  {:else}
                    <span>{tag.name}</span>
                  {/if}
                  <TagInput
                    clientTag={tag}
                    label=""
                    clazz="py-0 px-1"
                    onclick={(ev) => ev.stopPropagation()}
                    onkeydown={(ev) => ev.stopPropagation()}
                  />
                  <button onclick={() => tagCopy(tag)}>
                    <Copy class="size-3" />
                  </button>
                  <button onclick={() => tagCut(tag)}>
                    <Scissors class="size-3" />
                  </button>
                  <button onclick={() => tagDeleteNode(tag)}>
                    <Trash2 class="size-3" />
                  </button>
                </div>
              </TreeView.Item>
            {/each}
          {/if}
        </TreeView.BranchContent>
      </TreeView.Branch>
    {:else}
      <TreeView.Item class="truncate">
        <FileIcon class="size-4 shrink-0" />
        {node.name}
      </TreeView.Item>
    {/if}
  </TreeView.NodeProvider>
{/snippet}

<div class="flex">
  <pre>{JSON.stringify(data.tags, null, 2)}</pre>
  <div class="text-xs w-100" onpaste={(e) => handlePaste(e, undefined, [0])}>
    <svelte:boundary>
      <TreeView.Provider value={treeView}>
        <TreeView.Tree class="w-full">
          {#each Object.values(folderPatches.state).filter((f) => f.parentId == undefined) ?? [] as node, index (node.id)}
            {@render treeNode(node, [index])}
          {/each}
        </TreeView.Tree>
      </TreeView.Provider>

      {#snippet pending()}
        <LoaderIcon class="size-4 animate-spin" />
      {/snippet}
      {#snippet failed(error, reset)}
        <p class="text-error-700-300">{error}</p>
        <button onclick={reset} class="btn preset-filled">reset</button>
      {/snippet}
    </svelte:boundary>
  </div>

  {@render children?.()}
</div>
