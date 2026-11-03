<script lang="ts">
  import {
    Copy,
    FolderIcon,
    FolderPlus,
    Link2Icon,
    LoaderIcon,
    PencilIcon,
    Scissors,
    Settings2Icon,
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
    Popover,
  } from "@skeletonlabs/skeleton-svelte";

  import type { ClosureTableNode } from "$lib/server/sqlite/util/tagClosureTable";
  import { attempt } from "$lib/util/attempt";
  import { newId } from "$lib/util/newId";
  import { err, ok } from "neverthrow";
  import { z_TagFolderNodeInsert } from "$lib/sqlite/tables/index";
  import { z_TagOptionsInsert } from "$lib/sqlite/tagOptions";
  import { browser } from "$app/env";
  import { tagPatches, applyTagPatches } from "$live/tags";
  import { tagFolderPatches, applyTagFolderPatches } from "$live/tag-folder";
  import { PatchCollection } from "$lib/client/live/patchCollection.svelte";
  import type { BaseTypeStrings, TagOptionsInput } from "$lib/server/tag/tag";
  import { onMount, untrack } from "svelte";
  import TagInput from "$lib/client/componets/scada/TagInput.svelte";
  import { getEditorContext } from "$lib/client/editor/editorContext";
  import { getDataTypeStrings } from "$lib/remote/tag.remote";
  import {
    errorToString,
    neverThrowErrorToString,
    type NeverThrowError,
  } from "$lib/util/neverThrow";
  import { undoManager } from "$lib/client/history/undoManager";
  import { focusOnMount } from "$lib/client/util/use";
  import BindingEditor from "./BindingEditor.svelte";
  import { formatBindingResult, updateBinding } from "$lib/client/editor/bindings";
  import { evaluateTagBinding, resolveTagBindings } from "$lib/client/editor/tagExpressions";
  import type { TagBindingKey } from "$lib/tagBindings";
  import { getAbilityContext } from "$lib/client/permissions/abilityContext";
  import { tagWriteLevels, type TagWriteLevel } from "$lib/permissions/constants";

  let {
    tagFolders,
    tags,
  }: {
    tagFolders: Record<string, ClosureTableNode>;
    tags: Record<string, TagOptionsInput>;
  } = $props();

  const editor = getEditorContext();
  const ability = getAbilityContext();

  let tagFolderPatchesCollection = $state(
    new PatchCollection<ClosureTableNode, NeverThrowError>({
      initial: tagFolders,
      applyPatch: applyTagFolderPatches,
      subscribePatches: (notify) => {
        // adapt tagPatches' store .subscribe() to the (payload) => void shape;
        // the store value is `PatchPayload | undefined | { error }` - map
        // undefined / transport errors to the null "no payload" signal
        const unsubscribe = tagFolderPatches.subscribe((payload) => {
          if (!payload || "error" in payload) {
            notify(null);
            return;
          }
          notify(payload);
        });
        return unsubscribe; // svelte stores' subscribe() already returns an unsubscribe fn
      },
      maxHistory: 50,
      onMutation: () => undoManager.recordMutation("folders"),
      onError: (e) => console.error("Folder sync error:", e),
    }),
  );

  let tagPatchesCollection = $state(
    new PatchCollection<TagOptionsInput, NeverThrowError>({
      initial: tags,
      applyPatch: applyTagPatches,
      subscribePatches: (notify) => {
        const unsubscribe = tagPatches.subscribe((payload) => {
          if (!payload || "error" in payload) {
            notify(null);
            return;
          }
          notify(payload);
        });
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
    return () => {
      undoManager.unregister("folders");
      undoManager.unregister("tags");
      tagFolderPatchesCollection.dispose();
      tagPatchesCollection.dispose();
    };
  });

  function resolvedTagConfig(config: TagOptionsInput) {
    return resolveTagBindings(config);
  }

  function saveTagConfig(node: TagOptionsInput, changes: Partial<Omit<TagOptionsInput, "id">>) {
    const resolved = resolvedTagConfig({ ...node, ...changes });
    tagPatchesCollection.update(node.id, resolved);
  }

  function addResolvedTag(config: TagOptionsInput) {
    tagPatchesCollection.add(resolvedTagConfig(config));
  }

  function isTagBound(node: TagOptionsInput, key: TagBindingKey) {
    return Boolean(node.bindings?.[key]?.trim());
  }

  function tagBindingEvaluation(node: TagOptionsInput, key: TagBindingKey) {
    const expression = node.bindings?.[key];
    if (!expression?.trim()) return { result: "", error: null };

    const evaluation = evaluateTagBinding(expression, { tagConfig: node });
    if (evaluation.isErr()) {
      return { result: "", error: neverThrowErrorToString(evaluation.error) };
    }

    return { result: formatBindingResult(evaluation.value), error: null };
  }

  function tagBindingResult(node: TagOptionsInput, key: TagBindingKey) {
    return tagBindingEvaluation(node, key).result;
  }

  function tagBindingError(node: TagOptionsInput, key: TagBindingKey) {
    return tagBindingEvaluation(node, key).error;
  }

  function saveTagBinding(node: TagOptionsInput, key: TagBindingKey, expression: string) {
    saveTagConfig(node, { bindings: updateBinding(node.bindings, key, null, expression) });
  }

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
        const subTags = Object.values(allTags).filter((t) => t.folderId == node.id);
        return [...subFolders, ...subTags];
      },
      rootNode: {
        id: "root",
        name: "",
        parentId: null,
      },
    }),
  );

  const id = "TAGS_TREE";
  const TREE_EXPANDED_KEY = `editor-tree-expanded-${id}`;

  function loadExpandedFromStorage(): string[] {
    if (!browser) return [];
    const stored = attempt(() => localStorage.getItem(TREE_EXPANDED_KEY));
    if (stored.isErr) {
      console.error(`loadExpandedFromStorage() ${errorToString(stored.error)}`);
      return [];
    }
    if (!stored.data) return [];
    const raw = stored.data;
    const parsed = attempt(() => JSON.parse(raw));
    if (parsed.isErr) {
      console.error(`loadExpandedFromStorage() ${errorToString(parsed.error)}`);
      return [];
    }
    return parsed.data;
  }

  let treeView = useTreeView({
    id,
    collection,
    selectionMode: "multiple",
    defaultExpandedValue: loadExpandedFromStorage(),
    onSelectionChange: (details) => {
      const next = [...details.selectedValue];
      if (
        next.length === editor.tagSelectionIds.length &&
        next.every((id, index) => id === editor.tagSelectionIds[index])
      ) {
        return;
      }
      editor.tagSelectionIds = next;
    },
    onExpandedChange: (details) => {
      const result = attempt(() =>
        localStorage.setItem(TREE_EXPANDED_KEY, JSON.stringify(details.expandedValue)),
      );
      if (result.isErr) {
        console.error(`onExpandedChange() ${errorToString(result.error)}`);
      }
    },
  });

  $effect(() => {
    const value = editor.tagSelectionIds;
    untrack(() => {
      const current = treeView().selectedValue;
      if (current.length === value.length && current.every((id, index) => id === value[index])) {
        return;
      }
      expandSelected(value);
      treeView().setSelectedValue([...value]);
    });
  });

  // --- Helpers ------------------------------------------

  function expandSelected(ids: string[]) {
    const allFolders = {
      ...tagFolderPatchesCollection.state,
      ...stagingFolders,
    };
    const allTags = {
      ...tagPatchesCollection.state,
      ...stagingTags,
    };
    const expanded = new Set(treeView().expandedValue);

    for (const id of ids) {
      let folderId = allTags[id]?.folderId ?? allFolders[id]?.parentId ?? null;
      while (folderId) {
        expanded.add(folderId);
        folderId = allFolders[folderId]?.parentId ?? null;
      }
    }

    const current = treeView().expandedValue;
    if ([...expanded].every((id) => current.includes(id))) return;
    treeView().setExpandedValue([...expanded]);
  }

  function isClosureTableNode(node: object): node is ClosureTableNode {
    return (
      Object.hasOwn(node, "id") && Object.hasOwn(node, "name") && Object.hasOwn(node, "parentId")
    );
  }

  function isTagOptions(node: object): node is TagOptionsInput {
    return (
      Object.hasOwn(node, "id") && Object.hasOwn(node, "name") && Object.hasOwn(node, "dataType")
    );
  }

  function collectItems(values: string[]) {
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
    for (const val of values) {
      if (allFolders[val]) folders.push(allFolders[val]);
      else if (allTags[val]) tags.push(allTags[val]);
    }
    return { folders, tags };
  }

  function getSelectedItems() {
    return collectItems(treeView().selectedValue);
  }

  // ── Keyboard shortcuts ────────────────────────────────

  async function copyToClipboard(text: string) {
    const result = await attempt(() => navigator.clipboard.writeText(text));
    if (result.isErr) {
      return err({
        reason: "CLIPBOARD_WRITE_FAILED",
        cause: errorToString(result.error),
      } as const satisfies NeverThrowError);
    }
    return ok(null);
  }

  // ── Folder operations ─────────────────────────────────

  function getChildTags(nodes: ClosureTableNode[]): TagOptionsInput[] {
    return nodes.flatMap((n) => {
      let childTags = Object.values(tagPatchesCollection.state).filter((f) => f.folderId == n.id);
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
      ...nodes.map((n) => n.id),
      ...childFolders.map((f) => f.id),
    ]);
    undoManager.endTransaction();
  }

  async function foldersCut(nodes: ClosureTableNode[]) {
    const copied = await copyToClipboard(
      JSON.stringify(nodes.map((n) => ({ id: n.id, name: n.name }))),
    );
    if (copied.isErr()) {
      console.error(`foldersCut() ${neverThrowErrorToString(copied.error)}`);
    }
    foldersDelete(nodes);
  }

  // ── Tag operations ────────────────────────────────────

  async function tagsCut(tags: TagOptionsInput[]) {
    const copied = await copyToClipboard(JSON.stringify(tags));
    if (copied.isErr()) {
      console.error(`tagsCut() ${neverThrowErrorToString(copied.error)}`);
    }
    tagPatchesCollection.removeMany(tags.map((t) => t.id));
  }

  function tagsDelete(tags: TagOptionsInput[]) {
    tagPatchesCollection.removeMany(tags.map((t) => t.id));
  }

  // ── Global tree keyboard handler ──────────────────────

  async function handleTreeKeyup(e: KeyboardEvent) {
    const { folders, tags } = getSelectedItems();
    const hasSelection = folders.length > 0 || tags.length > 0;

    if (!hasSelection) return;

    // excusively one folder or one tag
    const onlyOneFolder = folders.length === 1 && tags.length === 0 ? true : false;
    const onlyOneTag = tags.length === 1 && folders.length === 0 ? true : false;

    if (e.key === "Delete") {
      e.preventDefault();
      undoManager.beginTransaction();
      tagsDelete(tags);
      foldersDelete(folders);
      undoManager.endTransaction();
    }

    if (e.key === "F2") {
      if (onlyOneFolder) renamingId = folders[0].id;
      if (onlyOneTag) renamingId = tags[0].id;
    }

    if (e.key === "f" && e.altKey && onlyOneFolder) {
      addFolder(folders[0]);
    }

    if (e.key === "t" && e.altKey && onlyOneFolder) {
      console.debug("Alt+T");
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
      const copied = await copyToClipboard(json);
      if (copied.isErr()) {
        console.error(`handleTreeKeyup() ${neverThrowErrorToString(copied.error)}`);
      }
    }

    if (e.key === "x" && e.ctrlKey) {
      let json = JSON.stringify([
        ...tags,
        ...folders,
        ...getChildFolders(folders),
        ...getChildTags(folders),
      ]);
      const copied = await copyToClipboard(json);
      if (copied.isErr()) {
        console.error(`handleTreeKeyup() ${neverThrowErrorToString(copied.error)}`);
        return;
      }
      undoManager.beginTransaction();
      tagsDelete(tags);
      foldersDelete(folders);
      undoManager.endTransaction();
    }
  }

  // ── Context menu state ────────────────────────────────

  let contextMenuFolders: ClosureTableNode[] = $state([]);
  let contextMenuTags: TagOptionsInput[] = $state([]);

  function handleTreeContextMenu(event: MouseEvent) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const tagId = target.closest<HTMLElement>("[data-tag-id]")?.dataset.tagId;
    const folderId = target.closest<HTMLElement>("[data-folder-id]")?.dataset.folderId;
    const id = tagId ?? folderId;

    if (!id) {
      contextMenuFolders = [];
      contextMenuTags = [];
      return;
    }

    const wasSelected = treeView().selectedValue.includes(id);
    if (!wasSelected) {
      treeView().setSelectedValue([id]);
    }

    const { folders, tags } = wasSelected ? getSelectedItems() : collectItems([id]);
    contextMenuFolders = folders;
    contextMenuTags = tags;
  }

  // ── Inline add / rename ───────────────────────────────

  let renamingId: string | null = $state(null);

  // ── Staging state for new items ──────────────────────
  let stagingFolders = $state<Record<string, ClosureTableNode>>({});
  let stagingTags = $state<Record<string, TagOptionsInput>>({});

  function addFolder(parentNode: ClosureTableNode) {
    const id = newId();
    stagingFolders[id] = {
      id,
      name: "New Folder",
      parentId: parentNode.id,
    };
    renamingId = id;
    treeView().expand([parentNode.id]);
  }

  function addTag(parentNode: ClosureTableNode) {
    const id = newId();
    stagingTags[id] = {
      id,
      folderId: parentNode.id ?? null,
      name: "New Tag",
      dataType: "Double" as BaseTypeStrings,
      unit: "",
      bindings: null,
      writeLevel: "operator",
      trendEnabled: false,
      trendMinimumSamplingIntervalMs: 1000,
    };
    renamingId = id;
    treeView().expand([parentNode.id]);
  }

  function finalizeFolderRename(id: string, newName: string) {
    if (renamingId !== id) return;
    renamingId = null;
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
    if (renamingId !== id) return;
    renamingId = null;
    delete stagingFolders[id];
  }

  function finalizeTagRename(id: string, newName: string) {
    if (renamingId !== id) return;
    renamingId = null;
    // renaming an existing tag
    const current = tagPatchesCollection.state[id];
    if (current) {
      saveTagConfig(current, { name: newName });
      return;
    }
    // renaming a new staging tag outside the patchesCollection
    const pending = stagingTags[id];
    if (!pending) return;
    delete stagingTags[id];
    if (newName.trim()) {
      addResolvedTag({ ...pending, name: newName.trim() });
    }
  }

  function cancelTagRename(id: string) {
    if (renamingId !== id) return;
    renamingId = null;
    delete stagingTags[id];
  }

  // checks for duplicate tag names in a specific folder and returns a new unique name if neeeded
  function checkDuplicateTagName(name: string, parentNode: ClosureTableNode | undefined) {
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
  function checkDuplicateFolderName(name: string, parentNode: ClosureTableNode | undefined) {
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

  async function readClipboard() {
    const result = await attempt(() => navigator.clipboard.readText());
    if (result.isErr) {
      return err({
        reason: "CLIPBOARD_READ_FAILED",
        cause: errorToString(result.error),
      } as const satisfies NeverThrowError);
    }
    return ok(result.data);
  }

  function handlePasteText(text: string, parentNode: ClosureTableNode | undefined) {
    const json = attempt(() => JSON.parse(text));
    if (json.isErr) {
      return err({
        reason: "PASTE_INVALID_JSON",
        cause: errorToString(json.error),
      } as const satisfies NeverThrowError);
    }

    // not an array
    if (!Array.isArray(json.data) || json.data.length <= 0) {
      return err({
        reason: "PASTE_NOT_AN_ARRAY",
        cause: `pasted data is not an array with at least one element ${text}`,
      } as const satisfies NeverThrowError);
    }

    let tags: TagOptionsInput[] = [];
    let folders: ClosureTableNode[] = [];

    for (const data of json.data) {
      let tagResult = z_TagOptionsInsert.safeParse(data);
      let folderResult = z_TagFolderNodeInsert.safeParse(data);
      if (!tagResult.success && !folderResult.success) {
        return err({
          reason: "PASTE_INVALID_TAG_OR_FOLDER",
          cause: `parse into tag or folder failed, wrong format ${data}  ${tagResult.error} ${folderResult.error}`,
        } as const satisfies NeverThrowError);
      }

      // check tagResult first as folderResult also has id and name feilds
      if (tagResult.data) tags.push(tagResult.data);
      else if (folderResult.data) folders.push(folderResult.data);
    }

    // check for relationships betwen pasted folder and create new id's while keeping the relationships
    for (const folder of folders) {
      const oldId = folder.id;
      const id = newId();
      folder.id = id;

      //if the pasted folders are nested and the child is referencing the old id give the references the new id
      for (const f of folders) {
        if (oldId == f.parentId) {
          f.parentId = id;
        }
      }

      for (const t of tags) {
        if (oldId == t.folderId) {
          t.folderId = id;
        }
      }
    }

    // if multiple tags or folders added just create one history entry
    undoManager.beginTransaction();

    for (const folder of folders) {
      // no need to assign new id as it has already been done for the folders in the loop above
      let name = checkDuplicateFolderName(folder.name, parentNode);
      let parentId: string | null = parentNode?.id ?? null;

      //if the pasted folders are nested and the child is referencing the parent
      if (folders.find((f) => f.id == folder.parentId)) {
        // assign the folderId from the pasted folder - else just insert it in the selected folder
        parentId = folder.parentId;
      }

      tagFolderPatchesCollection.add({
        id: folder.id,
        name,
        parentId,
      });
    }

    for (const tag of tags) {
      const id = newId();
      let name = checkDuplicateTagName(tag.name, parentNode);
      let folderId: string | null | undefined = parentNode?.id ?? null;

      //if the pasted folders are nested and the child is referencing the parent
      if (folders.find((f) => f.id == tag.folderId)) {
        // assign the folderId from the pasted tag - else just insert it in the selected folder
        folderId = tag.folderId;
      }

      addResolvedTag({
        id,
        folderId: folderId ?? parentNode?.id ?? null,
        name: name,
        dataType: tag.dataType,
        initalValue: tag.initalValue ?? null,
        nodeId: tag.nodeId ?? null,
        writeable: tag.writeable ?? true,
        exposeOverOpcua: tag.exposeOverOpcua ?? true,
        parameters: tag.parameters ?? null,
        unit: tag.unit ?? "",
        bindings: tag.bindings ?? null,
        writeLevel: tag.writeLevel ?? "operator",
        trendEnabled: tag.trendEnabled ?? false,
        trendMinimumSamplingIntervalMs: tag.trendMinimumSamplingIntervalMs ?? 1000,
      });
    }

    undoManager.endTransaction();

    return ok(null);
  }

  async function handlePaste(e: ClipboardEvent, parentNode: ClosureTableNode | undefined) {
    const text = e.clipboardData?.getData("text/plain");
    e.stopPropagation();
    if (!text) return;
    const result = handlePasteText(text, parentNode);
    if (result.isErr()) {
      console.error(`handlePaste() ${neverThrowErrorToString(result.error)}`);
    }
  }

  async function handleMenuSelect(value: string) {
    switch (value) {
      case "Rename": {
        const onlyOneFolder = contextMenuFolders.length === 1 && contextMenuTags.length === 0;
        const onlyOneTag = contextMenuTags.length === 1 && contextMenuFolders.length === 0;
        if (onlyOneFolder) renamingId = contextMenuFolders[0].id;
        if (onlyOneTag) renamingId = contextMenuTags[0].id;
        return;
      }
      case "newTag":
        addTag(
          contextMenuFolders[0] ?? {
            id: "root",
            name: "root",
            parentId: null,
          },
        );
        return;
      case "newFolder":
        addFolder(
          contextMenuFolders[0] ?? {
            id: "root",
            name: "root",
            parentId: null,
          },
        );
        return;
      case "cut":
        if (contextMenuFolders.length === 0 && contextMenuTags.length === 0) return;
        if (contextMenuFolders.length > 0) await foldersCut(contextMenuFolders);
        else if (contextMenuTags.length > 0) await tagsCut(contextMenuTags);
        return;
      case "copy": {
        if (contextMenuFolders.length === 0 && contextMenuTags.length === 0) return;
        const json = JSON.stringify([...contextMenuTags, ...contextMenuFolders]);
        const copied = await copyToClipboard(json);
        if (copied.isErr()) {
          console.error(`copy() ${neverThrowErrorToString(copied.error)}`);
        }
        return;
      }
      case "paste": {
        if (contextMenuFolders.length === 0 && contextMenuTags.length === 0) return;
        const text = await readClipboard();
        if (text.isErr()) {
          console.error(`paste() ${neverThrowErrorToString(text.error)}`);
          return;
        }
        if (!text.value) return;
        const result = handlePasteText(text.value, contextMenuFolders[0]);
        if (result.isErr()) {
          console.error(`paste() ${neverThrowErrorToString(result.error)}`);
        }
        return;
      }
      case "delete":
        if (contextMenuFolders.length === 0 && contextMenuTags.length === 0) return;
        undoManager.beginTransaction();
        tagsDelete(contextMenuTags);
        foldersDelete(contextMenuFolders);
        undoManager.endTransaction();
        return;
    }
  }
</script>

{#snippet tagBindingEditor(node: TagOptionsInput, key: TagBindingKey, label: string)}
  <BindingEditor
    {label}
    binding={node.bindings?.[key] ?? ""}
    contextDescription="tagConfig"
    scope="tag"
    savedError={tagBindingError(node, key)}
    onBindingSave={(expression) => saveTagBinding(node, key, expression)}
    onBindingRemove={() => saveTagBinding(node, key, "")}
  />
{/snippet}

{#snippet treeNode(node: ClosureTableNode | TagOptionsInput, indexPath: number[])}
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
        <TreeView.BranchControl data-folder-id={node.id}>
          <TreeView.BranchIndicator />
          <TreeView.BranchText class="truncate w-full">
            <FolderIcon class="size-4 shrink-0 opacity-60" />

            {#if renamingId === node.id}
              <input
                type="text"
                class="input p-0 text-xs grow"
                value={node.name}
                use:focusOnMount
                onblur={(e) => finalizeFolderRename(node.id, e.currentTarget.value)}
                onkeydown={(e) => {
                  if (e.key === "Enter") finalizeFolderRename(node.id, e.currentTarget.value);
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
      <Popover>
        <Popover.Context>
          {#snippet children(tagEditPopover)}
            <TreeView.Item data-tag-id={node.id}>
              <Popover.Trigger>
                {#snippet element(attributes)}
                  <button
                    {...attributes}
                    onclick={(ev) => {
                      // stop opening on click
                      ev.preventDefault();
                    }}
                    ondblclick={() => {
                      tagEditPopover().setOpen(true);
                    }}
                    tabindex={-1}
                    class="w-full flex items-center justify-between gap-4 min-w-0 focus-visible:outline-none"
                  >
                    <div class="flex items-center gap-2 min-w-0 w-full">
                      <TagIcon class="size-4 shrink-0 opacity-60" />
                      {#if renamingId === node.id}
                        <input
                          type="text"
                          class="input p-1 text-xs grow"
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
                        <span class="truncate" title={node.name}>{node.name}</span>
                        {#if node.bindings}
                          <Link2Icon class="size-5 shrink-0 opacity-85" />
                        {/if}
                      {/if}
                    </div>
                    {#if renamingId !== node.id}
                      <TagInput
                        id={node.id}
                        label=""
                        class="py-0  border-none max-w-40 rounded-sm"
                        onclick={(ev) => ev.stopPropagation()}
                        onkeydown={(ev) => ev.stopPropagation()}
                      />
                    {/if}
                  </button>
                {/snippet}
              </Popover.Trigger>
            </TreeView.Item>

            <Portal>
              <Popover.Positioner>
                <Popover.Content class="bg-surface-100-900 rounded-lg p-2">
                  <fieldset class="flex flex-col gap-2" disabled={!ability.can("update", "Tag")}>
                    <label class="opacity-60" for={`dataType-${node.id}`}>Data Type</label>
                    <div class="flex items-center gap-2">
                      {#if isTagBound(node, "dataType")}
                        <input
                          id={`dataType-${node.id}`}
                          class="input py-0"
                          value={tagBindingResult(node, "dataType")}
                          disabled
                          placeholder="No result"
                        />
                      {:else}
                        <select
                          id={`dataType-${node.id}`}
                          class="select py-1.5"
                          value={node.dataType}
                          onchange={(e) =>
                            saveTagConfig(node, {
                              dataType: e.currentTarget.value as BaseTypeStrings,
                            })}
                        >
                          {#each await getDataTypeStrings() as dataType}
                            <option value={dataType}>{dataType}</option>
                          {/each}
                        </select>
                      {/if}
                      {@render tagBindingEditor(node, "dataType", "Data Type")}
                    </div>

                    <label class="opacity-60" for={`nodeId-${node.id}`}>
                      Driver connection path
                    </label>
                    <div class="flex gap-2">
                      <input
                        id={`nodeId-${node.id}`}
                        type="text"
                        class="input py-0 placeholder:opacity-50"
                        value={isTagBound(node, "nodeId")
                          ? tagBindingResult(node, "nodeId")
                          : (node.nodeId ?? "")}
                        disabled={isTagBound(node, "nodeId")}
                        placeholder={isTagBound(node, "nodeId")
                          ? "No result"
                          : "[deviceName]pathToTag"}
                        onblur={(e) =>
                          saveTagConfig(node, {
                            nodeId: e.currentTarget.value || null,
                          })}
                        onkeydown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                          if (e.key === "Escape") {
                            e.currentTarget.value = node.nodeId ?? "";
                            e.currentTarget.blur();
                          }
                        }}
                      />
                      {@render tagBindingEditor(node, "nodeId", "Node Id")}
                    </div>

                    <div class="flex items-center gap-2">
                      <label class="opacity-60 mr-auto" for={`writeable-${node.id}`}>
                        Writeable
                      </label>
                      <input
                        id={`writeable-${node.id}`}
                        type="checkbox"
                        class="checkbox"
                        checked={isTagBound(node, "writeable")
                          ? tagBindingResult(node, "writeable") === "true"
                          : (node.writeable ?? true)}
                        disabled={isTagBound(node, "writeable")}
                        onchange={(e) =>
                          saveTagConfig(node, {
                            writeable: e.currentTarget.checked,
                          })}
                      />
                      {@render tagBindingEditor(node, "writeable", "Writeable")}
                    </div>

                    <label class="opacity-60" for={`writeLevel-${node.id}`}>Write Level</label>
                    <div class="flex items-center gap-2">
                      <select
                        id={`writeLevel-${node.id}`}
                        class="select py-1.5"
                        value={node.writeLevel ?? "operator"}
                        disabled={!ability.can("manage", "Tag")}
                        title={!ability.can("manage", "Tag")
                          ? "User does not have permission to edit"
                          : ""}
                        onchange={(e) =>
                          saveTagConfig(node, {
                            writeLevel: e.currentTarget.value as TagWriteLevel,
                          })}
                      >
                        {#each tagWriteLevels as level}
                          <option value={level}>{level}</option>
                        {/each}
                      </select>
                    </div>

                    <div class="flex items-center gap-2">
                      <label class="opacity-60 mr-auto" for={`exposeOverOpcua-${node.id}`}>
                        Expose Tag On OPCUA Server
                      </label>
                      <input
                        id={`exposeOverOpcua-${node.id}`}
                        type="checkbox"
                        class="checkbox"
                        checked={isTagBound(node, "exposeOverOpcua")
                          ? tagBindingResult(node, "exposeOverOpcua") === "true"
                          : (node.exposeOverOpcua ?? true)}
                        disabled={isTagBound(node, "exposeOverOpcua")}
                        onchange={(e) =>
                          saveTagConfig(node, {
                            exposeOverOpcua: e.currentTarget.checked,
                          })}
                      />
                      {@render tagBindingEditor(node, "exposeOverOpcua", "Expose OPC UA")}
                    </div>

                    <hr />
                    <p>Trending</p>
                    <div class="flex items-center gap-2">
                      <label class="opacity-60 mr-auto" for={`trendEnabled-${node.id}`}>
                        Enabled
                      </label>
                      {#if isTagBound(node, "trendEnabled")}
                        <input
                          id={`trendEnabled-${node.id}`}
                          class="input py-0"
                          value={tagBindingResult(node, "trendEnabled")}
                          disabled
                          placeholder="No result"
                        />
                      {:else}
                        <input
                          id={`trendEnabled-${node.id}`}
                          type="checkbox"
                          class="checkbox"
                          checked={node.trendEnabled ?? false}
                          onchange={(e) =>
                            saveTagConfig(node, {
                              trendEnabled: Boolean(e.currentTarget.checked),
                            })}
                        />
                      {/if}
                      {@render tagBindingEditor(node, "trendEnabled", "Trend Enabled")}
                    </div>
                    <div class="flex items-center gap-2">
                      <label
                        class="opacity-60 mr-auto"
                        for={`trendMinimumSamplingIntervalMs-${node.id}`}
                      >
                        Minimum interval
                      </label>
                      {#if isTagBound(node, "trendMinimumSamplingIntervalMs")}
                        <input
                          id={`trendMinimumSamplingIntervalMs-${node.id}`}
                          class="input py-0"
                          value={tagBindingResult(node, "trendMinimumSamplingIntervalMs")}
                          disabled
                          placeholder="No result"
                        />
                      {:else}
                        <input
                          id={`trendMinimumSamplingIntervalMs-${node.id}`}
                          type="number"
                          class="input w-24"
                          min="100"
                          step="100"
                          placeholder="minimum interval ms"
                          disabled={!(node.trendEnabled ?? false)}
                          value={node.trendMinimumSamplingIntervalMs ?? 1000}
                          onblur={(e) => {
                            const trendMinimumSamplingIntervalMs = Number(e.currentTarget.value);
                            saveTagConfig(node, { trendMinimumSamplingIntervalMs });
                          }}
                        />
                      {/if}
                      <span class="text-xs opacity-60">ms</span>
                      {@render tagBindingEditor(
                        node,
                        "trendMinimumSamplingIntervalMs",
                        "Trend Interval",
                      )}
                    </div>

                    <div class="flex items-start gap-2">
                      <Settings2Icon class="size-4 shrink-0 opacity-60 mt-1" />
                      <label class="opacity-60 pt-1" for={`parameters-${node.id}`}>
                        Parameters
                      </label>
                      <textarea
                        id={`parameters-${node.id}`}
                        rows="4"
                        class="input py-0 font-mono text-xs"
                        value={isTagBound(node, "parameters")
                          ? tagBindingResult(node, "parameters")
                          : node.parameters
                            ? JSON.stringify(node.parameters, null, 2)
                            : ""}
                        disabled={isTagBound(node, "parameters")}
                        placeholder={isTagBound(node, "parameters") ? "No result" : ""}
                        onblur={(e) => {
                          const raw = e.currentTarget.value;
                          if (!raw.trim()) {
                            saveTagConfig(node, {
                              parameters: null,
                            });
                            return;
                          }
                          const parsed = attempt(() => JSON.parse(raw));
                          if (parsed.isErr) {
                            e.currentTarget.value = JSON.stringify(
                              node.parameters ?? null,
                              null,
                              2,
                            );
                            return;
                          }
                          saveTagConfig(node, {
                            parameters: parsed.data,
                          });
                        }}
                        onkeydown={(e) => {
                          if (e.key === "Escape") {
                            e.currentTarget.value = JSON.stringify(
                              node.parameters ?? null,
                              null,
                              2,
                            );
                            e.currentTarget.blur();
                          }
                        }}></textarea>
                      {@render tagBindingEditor(node, "parameters", "Parameters")}
                    </div>

                    <div class="flex items-center gap-2">
                      <Settings2Icon class="size-4 shrink-0 opacity-60" />
                      <label class="opacity-60" for={`unit-${node.id}`}>Unit</label>
                      <input
                        id={`unit-${node.id}`}
                        type="text"
                        class="input py-0"
                        value={isTagBound(node, "unit")
                          ? tagBindingResult(node, "unit")
                          : (node.unit ?? "")}
                        disabled={isTagBound(node, "unit")}
                        placeholder={isTagBound(node, "unit") ? "No result" : ""}
                        onblur={(e) => saveTagConfig(node, { unit: e.currentTarget.value })}
                        onkeydown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                          if (e.key === "Escape") {
                            e.currentTarget.value = node.unit ?? "";
                            e.currentTarget.blur();
                          }
                        }}
                      />
                      {@render tagBindingEditor(node, "unit", "Unit")}
                    </div>

                    <div class="flex items-center gap-2">
                      <Settings2Icon class="size-4 shrink-0 opacity-60" />
                      <label class="opacity-60" for={`type-${node.id}`}>Type</label>
                      <input
                        id={`type-${node.id}`}
                        type="text"
                        class="input py-0"
                        value={node.type ?? "tag"}
                        disabled
                      />
                    </div>
                  </fieldset>
                </Popover.Content>
              </Popover.Positioner>
            </Portal>
          {/snippet}
        </Popover.Context>
      </Popover>
    {/if}
  </TreeView.NodeProvider>
{/snippet}

<Menu class="overflow-y-scroll" onSelect={(details) => void handleMenuSelect(details.value)}>
  <Menu.ContextTrigger class="w-full pb-12">
    <TreeView.Provider value={treeView}>
      <TreeView.Tree
        class="w-full"
        onkeyup={handleTreeKeyup}
        oncontextmenu={handleTreeContextMenu}
        onpaste={(e) => {
          e.stopPropagation();
          handlePaste(e, undefined);
        }}
      >
        {#each Object.values( { ...tagFolderPatchesCollection.state, ...stagingFolders } ).filter((f) => f.parentId == undefined) ?? [] as node, index (node.id)}
          {@render treeNode(node, [index])}
        {/each}
      </TreeView.Tree>
    </TreeView.Provider>
  </Menu.ContextTrigger>
  <Portal>
    <Menu.Positioner>
      <Menu.Content class="text-xs border-none bg-surface-100-900">
        <Menu.Item value="Rename">
          <Menu.ItemText class="flex items-center w-full gap-2">
            <PencilIcon class="size-4" />
            <span>Rename</span>
            <span class="text-xs text-neutral-500 ml-auto">F2</span>
          </Menu.ItemText>
        </Menu.Item>
        <Menu.Item value="newTag">
          <Menu.ItemText class="flex items-center w-full gap-2">
            <TagPlus class="size-4" />
            <span>New Tag</span>
            <span class="text-xs text-neutral-500 ml-auto">Alt+T</span>
          </Menu.ItemText>
        </Menu.Item>
        <Menu.Item value="newFolder">
          <Menu.ItemText class="flex items-center w-full gap-2">
            <FolderPlus class="size-4" />
            <span>New Folder</span>
            <span class="text-xs text-neutral-500 ml-auto">Alt+F</span>
          </Menu.ItemText>
        </Menu.Item>
        <Menu.Separator />
        <Menu.Item
          value="cut"
          disabled={contextMenuFolders.length === 0 && contextMenuTags.length === 0}
        >
          <Menu.ItemText class="flex items-center w-full gap-2">
            <Scissors class="size-4" />
            <span>Cut</span>
            <span class="text-xs text-neutral-500 ml-auto">Ctrl+X</span>
          </Menu.ItemText>
        </Menu.Item>
        <Menu.Item
          value="copy"
          disabled={contextMenuFolders.length === 0 && contextMenuTags.length === 0}
        >
          <Menu.ItemText class="flex items-center w-full gap-2">
            <Copy class="size-4" />
            <span>Copy</span>
            <span class="text-xs text-neutral-500 ml-auto">Ctrl+C</span>
          </Menu.ItemText>
        </Menu.Item>
        <Menu.Item
          value="paste"
          disabled={contextMenuFolders.length === 0 && contextMenuTags.length === 0}
        >
          <Menu.ItemText class="flex items-center w-full gap-2">
            <Copy class="size-4" />
            <span>Paste</span>
            <span class="text-xs text-neutral-500 ml-auto">Ctrl+V</span>
          </Menu.ItemText>
        </Menu.Item>
        <Menu.Separator />
        <Menu.Item
          value="delete"
          disabled={contextMenuFolders.length === 0 && contextMenuTags.length === 0}
        >
          <Menu.ItemText class="flex items-center w-full gap-2">
            <Trash2 class="size-4" />
            <span>Delete</span>
            <span class="text-xs text-neutral-500 ml-auto">Del</span>
          </Menu.ItemText>
        </Menu.Item>
      </Menu.Content>
    </Menu.Positioner>
  </Portal>
</Menu>
