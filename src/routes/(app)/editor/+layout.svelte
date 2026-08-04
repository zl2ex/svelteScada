<script lang="ts">
  import {
    Copy,
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

  import type {
    ClosureTableNode,
    ClosureTableNodeOptionalId,
  } from "$lib/server/sqlite/util/tagClosureTable.js";
  import { tryCatch } from "$lib/util/tryCatch";
  import {
    z_shared_insertClosureTableNode,
    z_shared_insertTag,
  } from "$lib/validation/zod";
  import { browser } from "$app/env";

  let { data, children } = $props();

  function focusOnMount(node: HTMLInputElement) {
    node.focus();
    requestAnimationFrame(() => node.select());
  }

  import { tagPatches, applyTagPatches } from "$live/tags";
  import { tagFolderPatches, applyTagFolderPatches } from "$live/tag-folder";
  import { PatchCollection } from "$lib/client/live/patchCollection.svelte";
  import { UnifiedUndoManager } from "$lib/client/live/undoManager.svelte";
  import type {
    BaseTypeStringsWithArrays,
    TagOptionsInput,
  } from "$lib/server/tag/tag.js";
  import { onMount } from "svelte";
  import type { TagInsertOptionalId } from "$lib/server/sqlite/tables/tags.js";
  import TagInput from "$lib/client/componets/scada/TagInput.svelte";

  const undoManager = new UnifiedUndoManager();

  let tagFolderPatchesCollection = $state(
    new PatchCollection<ClosureTableNode>({
      initial: data.tagFolders,
      applyPatch: applyTagFolderPatches,
      subscribePatches: (notify) => {
        // adapt tagPatches' store .subscribe() to the (payload) => void shape
        const unsubscribe = tagFolderPatches.subscribe(notify);
        return unsubscribe; // svelte stores' subscribe() already returns an unsubscribe fn
      },
      maxHistory: 50,
      onMutation: () => undoManager.recordMutation("folders"),
      onError: (e) => console.error("Folder sync error:", e),
    }),
  );

  let tagPatchesCollection = $state(
    new PatchCollection<TagOptionsInput>({
      initial: data.tags,
      applyPatch: applyTagPatches,
      subscribePatches: (notify) => {
        const unsubscribe = tagPatches.subscribe(notify);
        return unsubscribe;
      },
      maxHistory: 50,
      onMutation: () => undoManager.recordMutation("tags"),
      onError: (e) => console.error("Tag sync error:", e),
    }),
  );

  undoManager.register("folders", tagFolderPatchesCollection);
  undoManager.register("tags", tagPatchesCollection);

  onMount(() => {
    // unmount
    return () => {
      undoManager.unregister("folders");
      undoManager.unregister("tags");
      tagFolderPatchesCollection.dispose();
      tagPatchesCollection.dispose();
    };
  });

  let collection = $state(
    createTreeViewCollection<ClosureTableNode | TagOptionsInput>({
      nodeToValue: (node) => node.id,
      nodeToString: (node) => node.name,
      nodeToChildren: (node) => {
        if (!isClosureTableNode(node)) return [];
        const allFolders = {
          ...tagFolderPatchesCollection.state,
          ...stagingFolders,
        };
        const allTags = {
          ...tagPatchesCollection.state,
          ...stagingTags,
        };
        const subFolders =
          node.id === "root"
            ? Object.values(allFolders).filter((f) => f.parentId == undefined)
            : Object.values(allFolders).filter((f) => f.parentId == node.id);
        const subTags = Object.values(allTags).filter(
          (t) => t.folderId == node.id,
        );
        return [...subFolders, ...subTags];
      },
      rootNode: {
        id: "root",
        name: "",
        parentId: null,
      },
    }),
  );

  const id = crypto.randomUUID();
  const TREE_EXPANDED_KEY = `editor-tree-expanded-${id}`;

  function loadExpandedFromStorage(): string[] {
    if (!browser) return [];
    try {
      const stored = localStorage.getItem(TREE_EXPANDED_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  let treeView = useTreeView({
    id,
    collection,
    selectionMode: "multiple",
    defaultExpandedValue: loadExpandedFromStorage(),
    onExpandedChange: (details) => {
      localStorage.setItem(
        TREE_EXPANDED_KEY,
        JSON.stringify(details.expandedValue),
      );
    },
  });

  // --- Helpers ------------------------------------------

  function isClosureTableNode(node: object): node is ClosureTableNode {
    return (
      Object.hasOwn(node, "id") &&
      Object.hasOwn(node, "name") &&
      Object.hasOwn(node, "parentId")
    );
  }

  function isTagOptions(node: object): node is TagOptionsInput {
    return (
      Object.hasOwn(node, "id") &&
      Object.hasOwn(node, "name") &&
      Object.hasOwn(node, "dataType")
    );
  }

  function getSelectedItems() {
    const selectedValues = treeView().selectedValue;
    const allFolders = {
      ...tagFolderPatchesCollection.state,
      ...stagingFolders,
    };
    const allTags = {
      ...tagPatchesCollection.state,
      ...stagingTags,
    };
    const folders: ClosureTableNode[] = [];
    const tags: TagOptionsInput[] = [];
    for (const val of selectedValues) {
      if (allFolders[val]) folders.push(allFolders[val]);
      else if (allTags[val]) tags.push(allTags[val]);
    }
    return { folders, tags };
  }

  // ── Keyboard shortcuts ────────────────────────────────

  if (browser) {
    document.addEventListener("keyup", (e) => {
      if (e.key == "z" && e.ctrlKey) undoManager.undo();
      if (e.key == "y" && e.ctrlKey) undoManager.redo();
    });
  }

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text);
  }

  // ── Folder operations ─────────────────────────────────

  function getChildTags(nodes: ClosureTableNode[]): TagOptionsInput[] {
    return nodes.flatMap((n) => {
      let childTags = Object.values(tagPatchesCollection.state).filter(
        (f) => f.folderId == n.id,
      );
      let childFolders = Object.values(tagFolderPatchesCollection.state).filter(
        (f) => f.parentId == n.id,
      );
      return [...childTags, ...getChildTags(childFolders)];
    });
  }

  function getChildFolders(nodes: ClosureTableNode[]): ClosureTableNode[] {
    return nodes.flatMap((n) => {
      let childFolders = Object.values(tagFolderPatchesCollection.state).filter(
        (f) => f.parentId == n.id,
      );
      return [...childFolders, ...getChildFolders(childFolders)];
    });
  }

  // delete all tags and folders inside the parent folder
  function foldersDelete(nodes: ClosureTableNode[]) {
    let childTags = getChildTags(nodes);
    let childFolders = getChildFolders(nodes);

    undoManager.beginTransaction();
    tagPatchesCollection.removeMany(childTags.map((t) => t.id));
    tagFolderPatchesCollection.removeMany([
      ...childFolders.map((f) => f.id),
      ...nodes.map((n) => n.id),
    ]);
    undoManager.endTransaction();
  }

  function foldersCut(nodes: ClosureTableNode[]) {
    copyToClipboard(
      JSON.stringify(nodes.map((n) => ({ id: n.id, name: n.name }))),
    );
    foldersDelete(nodes);
  }

  // ── Tag operations ────────────────────────────────────

  function tagsCut(tags: TagOptionsInput[]) {
    copyToClipboard(JSON.stringify(tags));
    tagPatchesCollection.removeMany(tags.map((t) => t.id));
  }

  function tagsDelete(tags: TagOptionsInput[]) {
    tagPatchesCollection.removeMany(tags.map((t) => t.id));
  }

  // ── Global tree keyboard handler ──────────────────────

  function handleTreeKeyup(e: KeyboardEvent) {
    const { folders, tags } = getSelectedItems();
    const hasSelection = folders.length > 0 || tags.length > 0;

    if (!hasSelection) return;

    // excusively one folder or one tag
    const onlyOneFolder =
      folders.length === 1 && tags.length === 0 ? true : false;
    const onlyOneTag = tags.length === 1 && folders.length === 0 ? true : false;

    if (e.key === "Delete") {
      e.preventDefault();
      foldersDelete(folders);
      tagsDelete(tags);
    }

    if (e.key === "F2") {
      if (onlyOneFolder) renamingFolderId = folders[0].id;
      if (onlyOneTag) renamingTagId = tags[0].id;
    }

    if (e.key === "f" && e.altKey && onlyOneFolder) {
      addFolder(folders[0]);
    }

    if (e.key === "t" && e.altKey && onlyOneFolder) {
      addTag(folders[0]);
    }

    if (e.key === "c" && e.ctrlKey) {
      // copy selected but also if the selected folder has child tags or folders copy them too
      let json = JSON.stringify([
        ...tags,
        ...folders,
        ...getChildFolders(folders),
        ...getChildTags(folders),
      ]);
      copyToClipboard(json);
    }

    if (e.key === "x" && e.ctrlKey) {
      let json = JSON.stringify([
        ...tags,
        ...folders,
        ...getChildFolders(folders),
        ...getChildTags(folders),
      ]);
      copyToClipboard(json);

      foldersDelete(folders);
      tagsDelete(tags);
    }
  }

  // ── Context menu state ────────────────────────────────

  let contextMenuFolders: ClosureTableNode[] = $state([]);
  let contextMenuTags: TagOptionsInput[] = $state([]);

  // ── Inline add / rename ───────────────────────────────

  let renamingFolderId: string | null = $state(null);
  let renamingTagId: string | null = $state(null);

  // ── Staging state for new items ──────────────────────
  let stagingFolders = $state<Record<string, ClosureTableNode>>({});
  let stagingTags = $state<Record<string, TagOptionsInput>>({});

  function addFolder(parentNode: ClosureTableNode) {
    const newId = crypto.randomUUID();
    stagingFolders[newId] = {
      id: newId,
      name: "New Folder",
      parentId: parentNode.id,
    };
    renamingFolderId = newId;
    treeView().expand([parentNode.id]);
  }

  function addTag(parentNode: ClosureTableNode) {
    const newId = crypto.randomUUID();
    stagingTags[newId] = {
      id: newId,
      folderId: parentNode.id ?? null,
      name: "New Tag",
      dataType: "Double" as BaseTypeStringsWithArrays,
    };
    renamingTagId = newId;
    treeView().expand([parentNode.id]);
  }

  function finalizeFolderRename(id: string, newName: string) {
    if (renamingFolderId !== id) return;
    renamingFolderId = null;
    // renaming an existing node
    const current = tagFolderPatchesCollection.state[id];
    if (current) {
      current.name = checkDuplicateFolderName(newName, current);
      tagFolderPatchesCollection.update(id, current);
      return;
    }
    // renaming a new staging node outside the patchesCollection
    const pending = stagingFolders[id];
    if (!pending) return;
    delete stagingFolders[id];
    if (newName.trim()) {
      tagFolderPatchesCollection.add({ ...pending, name: newName.trim() });
    }
  }

  function cancelFolderRename(id: string) {
    if (renamingFolderId !== id) return;
    renamingFolderId = null;
    delete stagingFolders[id];
  }

  function finalizeTagRename(id: string, newName: string) {
    if (renamingTagId !== id) return;
    renamingTagId = null;
    // renaming an existing tag
    const current = tagPatchesCollection.state[id];
    if (current) {
      current.name = newName;
      tagPatchesCollection.update(id, current);
      return;
    }
    // renaming a new staging tag outside the patchesCollection
    const pending = stagingTags[id];
    if (!pending) return;
    delete stagingTags[id];
    if (newName.trim()) {
      tagPatchesCollection.add({ ...pending, name: newName.trim() });
    }
  }

  function cancelTagRename(id: string) {
    if (renamingTagId !== id) return;
    renamingTagId = null;
    delete stagingTags[id];
  }

  // checks for duplicate tag names in a specific folder and returns a new unique name if neeeded
  function checkDuplicateTagName(
    name: string,
    parentNode: ClosureTableNode | undefined,
  ) {
    let newName = name;
    const children = Object.values(tagPatchesCollection.state).filter(
      (f) => f.folderId == parentNode?.id,
    );

    let count = 0;
    while (children.map((c) => c.name).includes(newName)) {
      newName = newName + count;
      count++;
    }
    return newName;
  }

  // checks for duplicate folder name in a specific folder and returns a new unique name if neeeded
  function checkDuplicateFolderName(
    name: string,
    parentNode: ClosureTableNode | undefined,
  ) {
    let newName = name;
    const children = Object.values(tagFolderPatchesCollection.state).filter(
      (f) => f.parentId == parentNode?.id,
    );

    let count = 0;
    while (children.map((c) => c.name).includes(newName)) {
      newName = newName + count;
      count++;
    }
    return newName;
  }

  // ── Paste ─────────────────────────────────────────────

  async function readClipboard(): Promise<string | null> {
    return navigator.clipboard.readText();
  }

  function handlePasteText(
    text: string,
    parentNode: ClosureTableNode | undefined,
  ) {
    let json = tryCatch(JSON.parse, text);
    if (json.error) {
      throw Error(`handlePaste() `, { cause: json.error });
    }

    // not an array
    if (json.value.length <= 0) {
      throw Error(
        `handlePaste() pasted data is not an array with at least one element ${text}`,
      );
    }

    let tags: TagInsertOptionalId[] = [];
    let folders: ClosureTableNodeOptionalId[] = [];

    for (const data of json.value) {
      let tagResult = z_shared_insertTag.safeParse(data);
      let folderResult = z_shared_insertClosureTableNode.safeParse(data);
      if (!tagResult.success && !folderResult.success) {
        throw Error(
          `handlePaste() parse into tag or folder failed, wrong format ${data}  ${tagResult.error} ${folderResult.error}`,
        );
      }

      // check tagResult first as folderResult also has id and name feilds
      if (tagResult.data) tags.push(tagResult.data);
      else if (folderResult.data) folders.push(folderResult.data);
    }

    // if multiple tags or folders added just create one history entry
    undoManager.beginTransaction();

    for (const folder of folders) {
      const newId = folder.id ?? crypto.randomUUID();
      let name = checkDuplicateFolderName(folder.name, parentNode);
      let parentId: string | null = null;

      //if the pasted folders are nested and the child is referencing the parent
      if (folders.find((f) => f.id == folder.parentId)) {
        // assign the parentId from the pasted folder - else just insert it in the selected folder
        parentId = folder.parentId;
      }

      tagFolderPatchesCollection.add({
        id: newId,
        name,
        parentId: parentId ?? parentNode?.id ?? null,
      });
    }

    for (const tag of tags) {
      const newId = tag.id ?? crypto.randomUUID();
      let name = checkDuplicateTagName(tag.name, parentNode);
      let parentId: string | null | undefined = undefined;

      //if the pasted folders are nested and the child is referencing the parent
      if (folders.find((f) => f.id == tag.folderId)) {
        // assign the folderId from the pasted tag - else just insert it in the selected folder
        parentId = tag.folderId;
      }

      tagPatchesCollection.add({
        id: newId,
        folderId: parentId ?? parentNode?.id ?? null,
        name: name,
        dataType: tag.dataType,
        value: tag.value ?? null,
        nodeId: tag.nodeId ?? null,
        writeable: tag.writeable ?? true,
        exposeOverOpcua: tag.exposeOverOpcua ?? true,
        parameters: tag.parameters ?? null,
      });
    }

    undoManager.endTransaction();
  }

  async function handlePaste(
    e: ClipboardEvent,
    parentNode: ClosureTableNode | undefined,
  ) {
    const text = e.clipboardData?.getData("text/plain");
    e.stopPropagation();
    if (!text) return;
    handlePasteText(text, parentNode);
  }
</script>

{#snippet treeNode(
  node: ClosureTableNode | TagOptionsInput,
  indexPath: number[],
)}
  {@const folders = Object.values({
    ...tagFolderPatchesCollection.state,
    ...stagingFolders,
  }).filter((f) => f.parentId == node.id)}

  {@const tags = Object.values({
    ...tagPatchesCollection.state,
    ...stagingTags,
  }).filter((t) => t.folderId == node.id)}

  {@const children = [...(folders ?? []), ...(tags ?? [])]}

  <TreeView.NodeProvider value={{ node, indexPath }}>
    {#if isClosureTableNode(node)}
      <TreeView.Branch
        onpaste={(e) => {
          e.stopPropagation();
          handlePaste(e, node);
        }}
      >
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
        <TreeView.BranchContent>
          <TreeView.BranchIndentGuide />
          {#each children as child, childIndex (child.id)}
            {@render treeNode(child, [...indexPath, childIndex])}
          {/each}
        </TreeView.BranchContent>
      </TreeView.Branch>
    {:else if isTagOptions(node)}
      <TreeView.Item class="flex items-center gap-2">
        <TagIcon class="size-4 shrink-0" />
        {#if renamingTagId === node.id}
          <input
            type="text"
            class="border-none p-0 m-0 text-inherit bg-inherit"
            value={node.name}
            use:focusOnMount
            onblur={(e) => finalizeTagRename(node.id, e.currentTarget.value)}
            onkeydown={(e) => {
              if (e.key === "Enter")
                finalizeTagRename(node.id, e.currentTarget.value);
              if (e.key === "Escape") cancelTagRename(node.id);
            }}
          />
        {:else}
          <span>{node.name}</span>
          <TagInput
            id={node.id}
            label=""
            class="py-0 px-1 border-none w-20"
            onclick={(ev) => ev.stopPropagation()}
            onkeydown={(ev) => ev.stopPropagation()}
          />
        {/if}
      </TreeView.Item>
    {/if}
  </TreeView.NodeProvider>
{/snippet}

<div class="flex flex-col">
  {#if tagFolderPatchesCollection.syncError || tagPatchesCollection.syncError}
    <div
      class="bg-error-500 text-white text-xs px-2 py-1 flex items-center justify-between"
    >
      <span
        >Sync failed: {tagFolderPatchesCollection.syncError ||
          tagPatchesCollection.syncError}</span
      >
      <button
        class="ml-2 font-bold"
        onclick={() => {
          tagFolderPatchesCollection.syncError = null;
          tagPatchesCollection.syncError = null;
        }}>&times;</button
      >
    </div>
  {/if}
  <div class="text-xs w-100">
    <svelte:boundary>
      <Menu
        onOpenChange={(e) => {
          if (e.open) {
            const { folders, tags } = getSelectedItems();
            contextMenuFolders = folders;
            contextMenuTags = tags;
          }
        }}
      >
        <Menu.ContextTrigger class="w-full">
          <TreeView.Provider value={treeView}>
            <TreeView.Tree
              class="w-full"
              onkeyup={handleTreeKeyup}
              onpaste={(e) => {
                e.stopPropagation();
                handlePaste(e, undefined);
              }}
            >
              {#each Object.values( { ...tagFolderPatchesCollection.state, ...stagingFolders }, ).filter((f) => f.parentId == undefined) ?? [] as node, index (node.id)}
                {@render treeNode(node, [index])}
              {/each}
            </TreeView.Tree>
          </TreeView.Provider>
        </Menu.ContextTrigger>
        <Portal>
          <Menu.Positioner>
            <Menu.Content class="min-w-auto">
              {#if contextMenuFolders.length > 0}
                <Menu.Item
                  value="newTag"
                  disabled={contextMenuFolders.length !== 1}
                >
                  <Menu.ItemText class="w-full">
                    <button
                      class="flex items-center gap-2 w-full"
                      disabled={contextMenuFolders.length !== 1}
                      onclick={() => addTag(contextMenuFolders[0])}
                    >
                      <TagPlus class="size-4" />
                      <span>New Tag</span>
                      <span class="text-xs text-neutral-500 ml-auto">Alt+T</span
                      >
                    </button>
                  </Menu.ItemText>
                </Menu.Item>
                <Menu.Item
                  value="newFolder"
                  disabled={contextMenuFolders.length !== 1}
                >
                  <Menu.ItemText class="w-full">
                    <button
                      class="flex items-center gap-2 w-full"
                      disabled={contextMenuFolders.length !== 1}
                      onclick={() => addFolder(contextMenuFolders[0])}
                    >
                      <FolderPlus class="size-4" />
                      <span>New Folder</span>
                      <span class="text-xs text-neutral-500 ml-auto">Alt+F</span
                      >
                    </button>
                  </Menu.ItemText>
                </Menu.Item>
                <Menu.Separator />
              {/if}
              <Menu.Item
                value="cut"
                disabled={contextMenuFolders.length === 0 &&
                  contextMenuTags.length === 0}
              >
                <Menu.ItemText class="w-full">
                  <button
                    class="flex items-center gap-2 w-full"
                    disabled={contextMenuFolders.length === 0 &&
                      contextMenuTags.length === 0}
                    onclick={() => {
                      if (contextMenuFolders.length > 0)
                        foldersCut(contextMenuFolders);
                      else if (contextMenuTags.length > 0)
                        tagsCut(contextMenuTags);
                    }}
                  >
                    <Scissors class="size-4" />
                    <span>Cut</span>
                    <span class="text-xs text-neutral-500 ml-auto">Ctrl+X</span>
                  </button>
                </Menu.ItemText>
              </Menu.Item>
              <Menu.Item
                value="copy"
                disabled={contextMenuFolders.length === 0 &&
                  contextMenuTags.length === 0}
              >
                <Menu.ItemText class="w-full">
                  <button
                    class="flex items-center gap-2 w-full"
                    disabled={contextMenuFolders.length === 0 &&
                      contextMenuTags.length === 0}
                    onclick={() => {
                      let json = JSON.stringify([
                        ...contextMenuTags,
                        ...contextMenuFolders,
                      ]);
                      copyToClipboard(json);
                    }}
                  >
                    <Copy class="size-4" />
                    <span>Copy</span>
                    <span class="text-xs text-neutral-500 ml-auto">Ctrl+C</span>
                  </button>
                </Menu.ItemText>
              </Menu.Item>
              <Menu.Item
                value="paste"
                disabled={contextMenuFolders.length === 0 &&
                  contextMenuTags.length === 0}
              >
                <Menu.ItemText class="w-full">
                  <button
                    class="flex items-center gap-2 w-full"
                    disabled={contextMenuFolders.length === 0 &&
                      contextMenuTags.length === 0}
                    onclick={async () => {
                      const text = await readClipboard();
                      if (text) handlePasteText(text, contextMenuFolders[0]);
                    }}
                  >
                    <Copy class="size-4" />
                    <span>Paste</span>
                    <span class="text-xs text-neutral-500 ml-auto">Ctrl+V</span>
                  </button>
                </Menu.ItemText>
              </Menu.Item>
              <Menu.Separator />
              <Menu.Item
                value="delete"
                disabled={contextMenuFolders.length === 0 &&
                  contextMenuTags.length === 0}
              >
                <Menu.ItemText class="w-full">
                  <button
                    class="flex items-center gap-2 w-full"
                    disabled={contextMenuFolders.length === 0 &&
                      contextMenuTags.length === 0}
                    onclick={() => {
                      foldersDelete(contextMenuFolders);
                      tagsDelete(contextMenuTags);
                    }}
                  >
                    <Trash2 class="size-4" />
                    Delete
                    <span class="text-xs text-neutral-500 ml-auto">Del</span>
                  </button>
                </Menu.ItemText>
              </Menu.Item>
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu>

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

<style>
  :global(
    [data-scope="tree-view"] [data-part="item"][data-selected],
    [data-scope="tree-view"] [data-part="branch-control"][data-selected]
  ) {
    background-color: light-dark(
      var(--color-neutral-300),
      var(--color-neutral-800)
    );
    color: light-dark(var(--color-neutral-000), var(--color-neutral-900));
  }
</style>
