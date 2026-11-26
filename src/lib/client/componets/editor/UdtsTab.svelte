<script lang="ts">
  import {
    ClipboardPaste,
    Copy,
    Link2Icon,
    PencilIcon,
    Plus,
    Scissors,
    TagIcon,
    TimelineIcon,
    Trash2,
  } from "@lucide/svelte";
  import {
    Menu,
    Portal,
    Popover,
    TreeView,
    createTreeViewCollection,
    useTreeView,
  } from "@skeletonlabs/skeleton-svelte";
  import { getAbilityContext } from "$lib/client/permissions/abilityContext";
  import { getUdtDefinitionsContext } from "$lib/client/editor/udtDefinitionContext";
  import { newId } from "$lib/util/newId";
  import { attempt } from "$lib/util/attempt";
  import { errorToString, neverThrowErrorToString } from "$lib/util/neverThrow";
  import {
    z_UdtDefinitionInput,
    type UdtDefinitionInput,
    type UdtDefinitionTagInput,
  } from "$lib/sqlite/tables/udt_definitions";
  import { baseTypeKeys } from "$lib/validation/baseTypes";
  import { updateBinding } from "$lib/client/editor/bindings";
  import { tagBindingKeys, type TagBindingKey } from "$lib/tagBindings";
  import { scriptEvaluator } from "$lib/client/editor/scriptEvaluator";
  import type { TagOptionsInput } from "$lib/server/tag/tag";
  import { commitOrRevert, focusOnMount } from "$lib/client/util/use";
  import { isEditableTarget } from "$lib/client/editor/editorKeyboard";
  import { undoManager } from "$lib/client/history/undoManager";
  import TagEditorPopover from "./TagEditorPopover.svelte";
  import { materializeUdtRow } from "$lib/client/editor/udtBuilder";

  type RootNode = {
    kind: "root";
    id: "udt-root";
    name: string;
  };
  type DefinitionNode = {
    kind: "definition";
    id: string;
    name: string;
    definition: UdtDefinitionInput;
  };
  type ChildNode = {
    kind: "child";
    id: string;
    name: string;
    definitionId: string;
    child: UdtDefinitionTagInput;
  };
  type UdtTreeNode = RootNode | DefinitionNode | ChildNode;
  type ActiveEditor =
    | { kind: "definition"; definitionId: string }
    | { kind: "child"; definitionId: string; childId: string }
    | null;
  type UdtClipboardPayload =
    | { kind: "definition"; definition: UdtDefinitionInput }
    | { kind: "child"; definitionId: string; child: UdtDefinitionTagInput };

  const ability = getAbilityContext();
  const collection = getUdtDefinitionsContext();

  const rootNode: RootNode = {
    kind: "root",
    id: "udt-root",
    name: "UDTs",
  };

  function compareNames(a: string, b: string) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  }

  function sortedDefinitions() {
    return Object.values(collection.state).sort((a, b) => compareNames(a.name, b.name));
  }

  function sortedChildren(definition: UdtDefinitionInput) {
    return [...definition.children].sort((a, b) => compareNames(a.name, b.name));
  }

  function definitionNodeId(id: string) {
    return `udt:def:${id}`;
  }

  function childNodeId(definitionId: string, childId: string) {
    return `udt:child:${definitionId}:${childId}`;
  }

  function definitionNode(definition: UdtDefinitionInput): DefinitionNode {
    return {
      kind: "definition",
      id: definitionNodeId(definition.id),
      name: definition.name,
      definition,
    };
  }

  function childNode(definition: UdtDefinitionInput, child: UdtDefinitionTagInput): ChildNode {
    return {
      kind: "child",
      id: childNodeId(definition.id, child.id),
      name: child.name,
      definitionId: definition.id,
      child,
    };
  }

  function childrenOf(node: UdtTreeNode): UdtTreeNode[] {
    if (node.kind === "root") return sortedDefinitions().map(definitionNode);
    if (node.kind === "definition") {
      return sortedChildren(node.definition).map((child) => childNode(node.definition, child));
    }
    return [];
  }

  let collectionView = $state(
    createTreeViewCollection<UdtTreeNode>({
      nodeToValue: (node) => node.id,
      nodeToString: (node) => node.name,
      nodeToChildren: childrenOf,
      rootNode,
    }),
  );

  let treeView = useTreeView({
    id: "UDTS_TREE",
    collection: collectionView,
    selectionMode: "single",
    defaultExpandedValue: sortedDefinitions().map((definition) => definitionNodeId(definition.id)),
  });

  let activeEditor = $state<ActiveEditor>(null);
  let contextMenuNode = $state<UdtTreeNode | null>(null);
  let renamingId = $state<string | null>(null);
  let formError = $state<string | null>(null);

  let definitions = $derived(sortedDefinitions());

  let dataTypes = $derived(
    [...baseTypeKeys, ...definitions.map((definition) => definition.name)].sort(compareNames),
  );

  let activeDefinition = $derived(
    activeEditor ? collection.state[activeEditor.definitionId] : undefined,
  );

  let activeChild = $derived.by(() => {
    const editor = activeEditor;
    if (!editor || editor.kind !== "child" || !activeDefinition) return undefined;
    return activeDefinition.children.find((child) => child.id === editor.childId);
  });

  /**
   * Materializes the active child definition so the popover can display binding results
   * directly from the top-level fields.
   */
  let activeChildTag = $derived(
    activeDefinition && activeChild
      ? materializeUdtRow(childAsTag(activeDefinition, activeChild))
      : undefined,
  );

  function defaultChild(): UdtDefinitionTagInput {
    return {
      id: newId(),
      name: "NewChild",
      dataType: "Double",
      initalValue: null,
      driverPath: null,
      readonly: false,
      exposeOverOpcua: true,
      properties: null,
      unit: "",
      bindings: null,
      writeLevel: "operator",
      trendEnabled: false,
      trendMinimumSamplingIntervalMs: 1000,
    };
  }

  function uniqueName(base: string) {
    const names = new Set(definitions.map((definition) => definition.name));
    let name = base;
    let count = 1;
    while (names.has(name)) name = `${base}${count++}`;
    return name;
  }

  function updateDefinitionById(id: string, changes: Partial<Omit<UdtDefinitionInput, "id">>) {
    const current = collection.state[id];
    if (!current) return false;

    const next = {
      ...current,
      ...changes,
      children: [...(changes.children ?? current.children)].sort((a, b) =>
        compareNames(a.name, b.name),
      ),
    };
    const parsed = z_UdtDefinitionInput.safeParse(next);
    if (!parsed.success) {
      formError = parsed.error.message;
      return false;
    }

    const { id: definitionId, ...rest } = parsed.data;
    collection.update(definitionId, rest);
    formError = null;
    return true;
  }

  function updateChild(
    definitionId: string,
    childId: string,
    changes: Partial<UdtDefinitionTagInput>,
  ) {
    const definition = collection.state[definitionId];
    if (!definition) return false;
    return updateDefinitionById(definitionId, {
      children: definition.children.map((child) =>
        child.id === childId ? { ...child, ...changes } : child,
      ),
    });
  }

  function addDefinition() {
    const id = newId();
    const definition: UdtDefinitionInput = {
      id,
      name: uniqueName("NewUdt"),
      properties: {},
      children: [],
    };
    collection.add(definition);
    renamingId = definitionNodeId(id);
    treeView().expand([rootNode.id]);
  }

  function addChild(definitionId: string) {
    const definition = collection.state[definitionId];
    if (!definition) return;
    const child = defaultChild();
    updateDefinitionById(definitionId, {
      children: [...definition.children, child],
    });
    renamingId = childNodeId(definitionId, child.id);
    treeView().expand([definitionNodeId(definitionId)]);
  }

  function deleteDefinition(id: string) {
    collection.remove(id);
    if (activeEditor?.definitionId === id) activeEditor = null;
    renamingId = null;
  }

  function removeChild(definitionId: string, childId: string) {
    const definition = collection.state[definitionId];
    if (!definition) return;
    updateDefinitionById(definitionId, {
      children: definition.children.filter((child) => child.id !== childId),
    });
    if (activeEditor?.kind === "child" && activeEditor.childId === childId) {
      activeEditor = null;
    }
  }

  function childAsTag(
    definition: UdtDefinitionInput,
    child: UdtDefinitionTagInput,
  ): TagOptionsInput {
    return {
      ...child,
      folderId: null,
      parentTagId: null,
      udtDefinitionId: definition.id,
      udtDefinitionChildId: child.id,
      udtOverrides: null,
    };
  }

  function childChanges(changes: Partial<Omit<TagOptionsInput, "id">>) {
    const {
      folderId: _folderId,
      parentTagId: _parentTagId,
      udtDefinitionId: _udtDefinitionId,
      udtDefinitionChildId: _udtDefinitionChildId,
      udtOverrides: _udtOverrides,
      ...rest
    } = changes;
    return rest;
  }

  function isChildBound(child: UdtDefinitionTagInput, key: TagBindingKey) {
    return Boolean(child.bindings?.[key]?.trim());
  }

  /**
   * Caches binding errors for the active child definition.
   */
  let childBindingErrors = $derived.by(() => {
    const errors = new Map<TagBindingKey, string | null>();
    if (!activeChild || !activeDefinition) return errors;

    const tag = childAsTag(activeDefinition, activeChild);
    for (const key of tagBindingKeys) {
      const expression = activeChild.bindings?.[key];
      if (!expression?.trim()) continue;

      const evaluation = scriptEvaluator.evaluateTag(expression, {
        tagConfig: tag,
        properties: activeDefinition.properties,
      });
      errors.set(
        key,
        evaluation.isErr() ? neverThrowErrorToString(evaluation.error) : null,
      );
    }

    return errors;
  });

  /**
   * Returns whether the active child binding exists for a key.
   */
  function childBindingState(key: TagBindingKey) {
    return {
      bound: Boolean(activeChild && isChildBound(activeChild, key)),
      mixed: false,
    };
  }

  /**
   * Returns the cached binding error for the active child.
   */
  function childBindingError(key: TagBindingKey) {
    return childBindingErrors.get(key) ?? null;
  }

  function saveChildBinding(child: UdtDefinitionTagInput, key: TagBindingKey, expression: string) {
    if (!activeDefinition) return;
    updateChild(activeDefinition.id, child.id, {
      bindings: updateBinding(child.bindings, key, null, expression),
    });
  }

  function childBindingValue(key: TagBindingKey) {
    return activeChild?.bindings?.[key] ?? "";
  }

  function saveActiveChild(changes: Partial<Omit<TagOptionsInput, "id">>) {
    if (!activeDefinition || !activeChild) return;
    updateChild(
      activeDefinition.id,
      activeChild.id,
      childChanges(changes) as Partial<UdtDefinitionTagInput>,
    );
  }

  function saveActiveChildProperties(
    updater: (
      properties: NonNullable<UdtDefinitionTagInput["properties"]>,
    ) => NonNullable<UdtDefinitionTagInput["properties"]>,
  ) {
    if (!activeDefinition || !activeChild) return;
    updateChild(activeDefinition.id, activeChild.id, {
      properties: updater(activeChild.properties ?? {}),
    });
  }

  function saveActiveChildBinding(key: TagBindingKey, expression: string) {
    if (!activeChild) return;
    saveChildBinding(activeChild, key, expression);
  }

  function saveDefinitionProperties(
    updater: (properties: UdtDefinitionInput["properties"]) => UdtDefinitionInput["properties"],
  ) {
    if (!activeDefinition) return;
    updateDefinitionById(activeDefinition.id, {
      properties: updater(activeDefinition.properties),
    });
  }

  function openDefinitionEditor(definition: UdtDefinitionInput) {
    activeEditor = { kind: "definition", definitionId: definition.id };
  }

  function openChildEditor(definition: UdtDefinitionInput, child: UdtDefinitionTagInput) {
    activeEditor = { kind: "child", definitionId: definition.id, childId: child.id };
  }

  function closeEditor() {
    activeEditor = null;
  }

  function finalizeDefinitionRename(definitionId: string, newName: string) {
    renamingId = null;
    const name = newName.trim();
    if (name) updateDefinitionById(definitionId, { name });
  }

  function finalizeChildRename(definitionId: string, childId: string, newName: string) {
    renamingId = null;
    const name = newName.trim();
    if (name) updateChild(definitionId, childId, { name });
  }

  function handleTreeContextMenu(event: MouseEvent) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const childId = target.closest<HTMLElement>("[data-udt-child-id]")?.dataset.udtChildId;
    const definitionId = target.closest<HTMLElement>("[data-udt-definition-id]")?.dataset
      .udtDefinitionId;
    if (!definitionId) {
      contextMenuNode = null;
      return;
    }
    const definition = collection.state[definitionId];
    if (!definition) return;

    if (childId) {
      const child = definition.children.find((item) => item.id === childId);
      contextMenuNode = child ? childNode(definition, child) : null;
      if (contextMenuNode) treeView().setSelectedValue([contextMenuNode.id]);
      return;
    }
    contextMenuNode = definitionNode(definition);
    treeView().setSelectedValue([contextMenuNode.id]);
  }

  function handleMenuSelect(value: string) {
    const node = contextMenuNode;
    contextMenuNode = null;
    if (!node) return;

    if (node.kind === "definition") {
      switch (value) {
        case "addChild":
          addChild(node.definition.id);
          break;
        case "rename":
          renamingId = node.id;
          break;
        case "delete":
          deleteDefinition(node.definition.id);
          break;
        case "copy":
          void copyNode(node);
          break;
        case "cut":
          void cutNode(node);
          break;
        case "paste":
          void pasteFromClipboard(node);
          break;
      }
    } else if (node.kind === "child") {
      switch (value) {
        case "rename":
          renamingId = node.id;
          break;
        case "delete":
          removeChild(node.definitionId, node.child.id);
          break;
        case "copy":
          void copyNode(node);
          break;
        case "cut":
          void cutNode(node);
          break;
        case "paste":
          void pasteFromClipboard(node);
          break;
      }
    }
  }

  function canManage() {
    return ability.can("manage", "UdtDefinition");
  }

  async function copyToClipboard(text: string) {
    const result = await attempt(() => navigator.clipboard.writeText(text));
    if (result.isErr) {
      formError = `Clipboard write failed: ${errorToString(result.error)}`;
      return false;
    }
    return true;
  }

  async function readClipboard() {
    const result = await attempt(() => navigator.clipboard.readText());
    if (result.isErr) {
      formError = `Clipboard read failed: ${errorToString(result.error)}`;
      return null;
    }
    return result.data;
  }

  function selectedTreeNode(): UdtTreeNode | null {
    const selected = treeView().selectedValue[0];
    if (!selected) return null;
    return collectionView.findNode(selected) ?? null;
  }

  function definitionForNode(node: UdtTreeNode | null) {
    if (!node) return undefined;
    if (node.kind === "definition") return node.definition;
    if (node.kind === "child") return collection.state[node.definitionId];
    return undefined;
  }

  function clipboardPayload(node: UdtTreeNode): UdtClipboardPayload | null {
    if (node.kind === "definition") {
      return { kind: "definition", definition: node.definition };
    }
    if (node.kind === "child") {
      const definition = collection.state[node.definitionId];
      if (!definition) return null;
      const child = definition.children.find((item) => item.id === node.child.id);
      return child ? { kind: "child", definitionId: definition.id, child } : null;
    }
    return null;
  }

  async function copyNode(node: UdtTreeNode) {
    const payload = clipboardPayload(node);
    if (!payload) return false;
    formError = null;
    return copyToClipboard(JSON.stringify(payload));
  }

  async function cutNode(node: UdtTreeNode) {
    if (!(await copyNode(node))) return;
    undoManager.beginTransaction();
    if (node.kind === "definition") deleteDefinition(node.definition.id);
    else if (node.kind === "child") removeChild(node.definitionId, node.child.id);
    undoManager.endTransaction();
  }

  function uniqueChildName(definition: UdtDefinitionInput, base: string) {
    const names = new Set(definition.children.map((child) => child.name));
    if (!names.has(base)) return base;
    let count = 1;
    let name = `${base}${count}`;
    while (names.has(name)) {
      count++;
      name = `${base}${count}`;
    }
    return name;
  }

  function parseClipboardPayload(text: string): UdtClipboardPayload | null {
    const parsed = attempt(() => JSON.parse(text));
    if (parsed.isErr) {
      formError = `Invalid clipboard payload: ${errorToString(parsed.error)}`;
      return null;
    }
    const value = parsed.data as Partial<UdtClipboardPayload> | null;
    if (value?.kind === "definition" && value.definition) {
      return value as UdtClipboardPayload;
    }
    if (value?.kind === "child" && value.child && value.definitionId) {
      return value as UdtClipboardPayload;
    }
    formError = "Clipboard does not contain a UDT definition or child";
    return null;
  }

  function pastePayload(payload: UdtClipboardPayload, target: UdtTreeNode | null) {
    if (payload.kind === "definition") {
      const definition: UdtDefinitionInput = {
        id: newId(),
        name: uniqueName(payload.definition.name),
        properties: { ...payload.definition.properties },
        children: payload.definition.children.map((child) => ({ ...child, id: newId() })),
      };
      collection.add(definition);
      treeView().expand([rootNode.id]);
      formError = null;
      return true;
    }

    const definition = definitionForNode(target);
    if (!definition) {
      formError = "Select a UDT definition to paste the child into";
      return false;
    }
    const child: UdtDefinitionTagInput = {
      ...payload.child,
      id: newId(),
      name: uniqueChildName(definition, payload.child.name),
    };
    const pasted = updateDefinitionById(definition.id, {
      children: [...definition.children, child],
    });
    if (pasted) treeView().expand([definitionNodeId(definition.id)]);
    return pasted;
  }

  async function pasteFromClipboard(target: UdtTreeNode | null) {
    const text = await readClipboard();
    if (text === null) return;
    const payload = parseClipboardPayload(text);
    if (!payload) return;
    pastePayload(payload, target);
  }

  async function handleTreePaste(event: ClipboardEvent) {
    event.stopPropagation();
    const text = event.clipboardData?.getData("text/plain");
    if (!text) return;
    event.preventDefault();
    const payload = parseClipboardPayload(text);
    if (!payload) return;
    pastePayload(payload, selectedTreeNode());
  }

  function handleTreeKeyup(event: KeyboardEvent) {
    if (isEditableTarget(event.target)) return;
    const node = selectedTreeNode();
    if (!node || node.kind === "root") return;
    const modifier = event.ctrlKey || event.metaKey;

    if (event.key === "Delete") {
      event.preventDefault();
      undoManager.beginTransaction();
      if (node.kind === "definition") deleteDefinition(node.definition.id);
      else removeChild(node.definitionId, node.child.id);
      undoManager.endTransaction();
      return;
    }

    if (event.key === "F2") {
      event.preventDefault();
      renamingId = node.id;
      return;
    }

    if (event.altKey && event.key.toLowerCase() === "c" && node.kind === "definition") {
      event.preventDefault();
      addChild(node.definition.id);
      return;
    }

    if (modifier && event.key.toLowerCase() === "c") {
      event.preventDefault();
      void copyNode(node);
      return;
    }

    if (modifier && event.key.toLowerCase() === "x") {
      event.preventDefault();
      void cutNode(node);
    }
  }

  $effect(() => {
    if (!activeEditor) return;
    if (!activeDefinition || (activeEditor.kind === "child" && !activeChild)) {
      activeEditor = null;
    }
  });
</script>

{#snippet definitionLabel(node: DefinitionNode)}
  <span class="relative flex min-w-0 grow items-center gap-2">
    {#if renamingId === node.id}
      <input
        class="input h-7 min-w-0 flex-1 px-1"
        value={node.definition.name}
        use:focusOnMount
        onclick={(event) => event.stopPropagation()}
        ondblclick={(event) => event.stopPropagation()}
        {@attach commitOrRevert(
          (value) => finalizeDefinitionRename(node.definition.id, value),
          "string",
          () => {
            renamingId = null;
          },
          { commitOnUnchanged: true },
        )}
      />
    {:else}
      <button
        type="button"
        tabindex={-1}
        class="flex min-w-0 grow items-center gap-2 text-left"
        onclick={(event) => event.preventDefault()}
        ondblclick={() => openDefinitionEditor(node.definition)}
      >
        <TimelineIcon class="size-5 shrink-0 opacity-60" />
        <span class="truncate font-semibold">{node.definition.name}</span>
        <span class="text-[10px] opacity-50">{node.definition.children.length}</span>
      </button>
    {/if}

    {#if activeEditor?.kind === "definition" && activeEditor.definitionId === node.definition.id}
      <Popover.Anchor class="pointer-events-none absolute inset-0" />
    {/if}
  </span>
{/snippet}

{#snippet childLabel(node: ChildNode)}
  <span class="flex min-w-0 grow items-center gap-2">
    {#if renamingId === node.id}
      <input
        class="input h-7 min-w-0 flex-1 px-1"
        value={node.child.name}
        use:focusOnMount
        onclick={(event) => event.stopPropagation()}
        ondblclick={(event) => event.stopPropagation()}
        {@attach commitOrRevert(
          (value) => finalizeChildRename(node.definitionId, node.child.id, value),
          "string",
          () => {
            renamingId = null;
          },
          { commitOnUnchanged: true },
        )}
      />
    {:else}
      <TagIcon class="size-4 shrink-0 opacity-60" />
      <span class="truncate">{node.child.name}</span>
      {#if node.child.bindings}
        <Link2Icon class="size-5 shrink-0 opacity-85" />
      {/if}
      <span class="ml-auto truncate opacity-50">{node.child.dataType}</span>
    {/if}
  </span>
{/snippet}

{#snippet treeNode(node: UdtTreeNode, indexPath: number[])}
  {@const children = childrenOf(node)}
  <TreeView.NodeProvider value={{ node, indexPath }}>
    {#if node.kind === "definition"}
      <TreeView.Branch>
        <TreeView.BranchControl data-udt-definition-id={node.definition.id}>
          <TreeView.BranchIndicator />
          <div class="flex min-w-0 grow items-center justify-between gap-2">
            <TreeView.BranchText>
              {@render definitionLabel(node)}
            </TreeView.BranchText>
            <button
              type="button"
              class="rounded-full p-1 hover:bg-surface-300-700"
              title="Add child"
              onclick={(event) => {
                event.stopPropagation();
                addChild(node.definition.id);
              }}
            >
              <Plus class="size-3.5" />
            </button>
          </div>
        </TreeView.BranchControl>
        {#if children.length > 0}
          <TreeView.BranchContent>
            <TreeView.BranchIndentGuide />
            {#each children as child, index (child.id)}
              {@render treeNode(child, [...indexPath, index])}
            {/each}
          </TreeView.BranchContent>
        {/if}
      </TreeView.Branch>
    {:else if node.kind === "child"}
      <TreeView.Item
        data-udt-definition-id={node.definitionId}
        data-udt-child-id={node.child.id}
        ondblclick={() => {
          const definition = collection.state[node.definitionId];
          if (definition) openChildEditor(definition, node.child);
        }}
      >
        {@render childLabel(node)}
        {#if activeEditor?.kind === "child" && activeEditor.childId === node.child.id}
          <Popover.Anchor class="pointer-events-none absolute inset-0" />
        {/if}
      </TreeView.Item>
    {/if}
  </TreeView.NodeProvider>
{/snippet}

<Popover
  open={activeEditor !== null}
  onOpenChange={(details) => {
    if (!details.open) closeEditor();
  }}
  positioning={{ placement: "right-end", offset: { mainAxis: 48 } }}
>
  <div class="flex h-full min-h-0 flex-col gap-2 p-2 text-xs">
    <div class="flex items-center gap-2">
      <button
        class="btn preset-filled btn-sm flex-1"
        onclick={addDefinition}
        disabled={!canManage()}
      >
        <Plus class="size-4" /> New UDT
      </button>
    </div>

    <Menu onSelect={(details) => handleMenuSelect(details.value)}>
      <Menu.ContextTrigger class="flex flex-1 overflow-y-auto">
        <TreeView.Provider value={treeView}>
          <TreeView.Tree
            class="w-full"
            onkeyup={handleTreeKeyup}
            oncontextmenu={handleTreeContextMenu}
            onpaste={(event) => void handleTreePaste(event)}
          >
            {#each childrenOf(rootNode) as node, index (node.id)}
              {@render treeNode(node, [index])}
            {/each}
          </TreeView.Tree>
        </TreeView.Provider>
      </Menu.ContextTrigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content class="border-none bg-surface-100-900 text-xs">
            {#if contextMenuNode?.kind === "definition"}
              <Menu.Item value="addChild">
                <Menu.ItemText class="flex w-full items-center gap-2">
                  <Plus class="size-4" />
                  <span>Add child</span>
                  <span class="ml-auto text-xs text-neutral-500">Alt+C</span>
                </Menu.ItemText>
              </Menu.Item>
              <Menu.Item value="rename">
                <Menu.ItemText class="flex w-full items-center gap-2">
                  <PencilIcon class="size-4" />
                  <span>Rename</span>
                  <span class="ml-auto text-xs text-neutral-500">F2</span>
                </Menu.ItemText>
              </Menu.Item>
              <Menu.Separator />
              <Menu.Item value="copy">
                <Menu.ItemText class="flex w-full items-center gap-2">
                  <Copy class="size-4" />
                  <span>Copy</span>
                  <span class="ml-auto text-xs text-neutral-500">Ctrl+C</span>
                </Menu.ItemText>
              </Menu.Item>
              <Menu.Item value="cut">
                <Menu.ItemText class="flex w-full items-center gap-2">
                  <Scissors class="size-4" />
                  <span>Cut</span>
                  <span class="ml-auto text-xs text-neutral-500">Ctrl+X</span>
                </Menu.ItemText>
              </Menu.Item>
              <Menu.Item value="paste">
                <Menu.ItemText class="flex w-full items-center gap-2">
                  <ClipboardPaste class="size-4" />
                  <span>Paste</span>
                  <span class="ml-auto text-xs text-neutral-500">Ctrl+V</span>
                </Menu.ItemText>
              </Menu.Item>
              <Menu.Separator />
              <Menu.Item value="delete" class="text-error-600-400">
                <Menu.ItemText class="flex w-full items-center gap-2">
                  <Trash2 class="size-4" />
                  <span>Delete UDT</span>
                  <span class="ml-auto text-xs text-neutral-500">Del</span>
                </Menu.ItemText>
              </Menu.Item>
            {:else if contextMenuNode?.kind === "child"}
              <Menu.Item value="rename">
                <Menu.ItemText class="flex w-full items-center gap-2">
                  <PencilIcon class="size-4" />
                  <span>Rename</span>
                  <span class="ml-auto text-xs text-neutral-500">F2</span>
                </Menu.ItemText>
              </Menu.Item>
              <Menu.Separator />
              <Menu.Item value="copy">
                <Menu.ItemText class="flex w-full items-center gap-2">
                  <Copy class="size-4" />
                  <span>Copy</span>
                  <span class="ml-auto text-xs text-neutral-500">Ctrl+C</span>
                </Menu.ItemText>
              </Menu.Item>
              <Menu.Item value="cut">
                <Menu.ItemText class="flex w-full items-center gap-2">
                  <Scissors class="size-4" />
                  <span>Cut</span>
                  <span class="ml-auto text-xs text-neutral-500">Ctrl+X</span>
                </Menu.ItemText>
              </Menu.Item>
              <Menu.Item value="paste">
                <Menu.ItemText class="flex w-full items-center gap-2">
                  <ClipboardPaste class="size-4" />
                  <span>Paste</span>
                  <span class="ml-auto text-xs text-neutral-500">Ctrl+V</span>
                </Menu.ItemText>
              </Menu.Item>
              <Menu.Separator />
              <Menu.Item value="delete" class="text-error-600-400">
                <Menu.ItemText class="flex w-full items-center gap-2">
                  <Trash2 class="size-4" />
                  <span>Delete child</span>
                  <span class="ml-auto text-xs text-neutral-500">Del</span>
                </Menu.ItemText>
              </Menu.Item>
            {/if}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu>

    {#if formError}
      <p class="text-error-700-300">{formError}</p>
    {/if}
    {#if collection.syncError}
      <p class="text-error-700-300">
        {typeof collection.syncError === "string"
          ? collection.syncError
          : neverThrowErrorToString(collection.syncError)}
      </p>
    {/if}
  </div>

  {#if activeDefinition && activeChild && activeChildTag}
    <TagEditorPopover
      tags={[activeChildTag]}
      {dataTypes}
      canUpdate={canManage()}
      canManage={canManage()}
      bindingValue={childBindingValue}
      bindingMixed={() => false}
      bindingError={childBindingError}
      bindingState={childBindingState}
      hasOverride={() => false}
      onSave={saveActiveChild}
      onBindingSave={saveActiveChildBinding}
      onBindingRemove={(key) => saveActiveChildBinding(key, "")}
      onClearOverride={() => {}}
      onPropertiesChange={saveActiveChildProperties}
    />
  {:else if activeDefinition}
    <TagEditorPopover
      mode="udtDefinition"
      tags={[]}
      {dataTypes}
      canUpdate={canManage()}
      canManage={canManage()}
      bindingValue={() => ""}
      bindingMixed={() => false}
      bindingError={() => null}
      bindingState={() => ({ bound: false, mixed: false })}
      hasOverride={() => false}
      onSave={() => {}}
      onBindingSave={() => {}}
      onBindingRemove={() => {}}
      onClearOverride={() => {}}
      onPropertiesChange={() => {}}
      definitionProperties={activeDefinition.properties}
      onDefinitionPropertiesChange={saveDefinitionProperties}
    />
  {/if}
</Popover>
