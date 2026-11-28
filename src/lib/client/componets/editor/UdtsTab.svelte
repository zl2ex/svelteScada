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
  import { tagPropertyKeys } from "$lib/client/editor/propertyKeys";

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

  /**
   * Compares two names using numeric, case-insensitive locale ordering.
   *
   * @param a - first name
   * @param b - second name
   * @returns a negative, zero, or positive locale comparison value
   */
  function compareNames(a: string, b: string) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  }

  /**
   * Returns the UDT definitions sorted by name.
   *
   * @returns sorted definition list
   */
  function sortedDefinitions() {
    return Object.values(collection.state).sort((a, b) => compareNames(a.name, b.name));
  }

  /**
   * Returns a definition's children sorted by name.
   *
   * @param definition - definition whose children are sorted
   * @returns sorted copy of the children
   */
  function sortedChildren(definition: UdtDefinitionInput) {
    return [...definition.children].sort((a, b) => compareNames(a.name, b.name));
  }

  /**
   * Builds the tree id for a UDT definition node.
   *
   * @param id - definition id
   * @returns the prefixed tree node id
   */
  function definitionNodeId(id: string) {
    return `udt:def:${id}`;
  }

  /**
   * Builds the tree id for a UDT child node.
   *
   * @param definitionId - parent definition id
   * @param childId - child tag id
   * @returns the prefixed tree node id
   */
  function childNodeId(definitionId: string, childId: string) {
    return `udt:child:${definitionId}:${childId}`;
  }

  /**
   * Builds a definition tree node from a definition record.
   *
   * @param definition - definition to wrap
   * @returns the definition tree node
   */
  function definitionNode(definition: UdtDefinitionInput): DefinitionNode {
    return {
      kind: "definition",
      id: definitionNodeId(definition.id),
      name: definition.name,
      definition,
    };
  }

  /**
   * Builds a child tree node from a definition and its child record.
   *
   * @param definition - parent definition
   * @param child - child tag to wrap
   * @returns the child tree node
   */
  function childNode(definition: UdtDefinitionInput, child: UdtDefinitionTagInput): ChildNode {
    return {
      kind: "child",
      id: childNodeId(definition.id, child.id),
      name: child.name,
      definitionId: definition.id,
      child,
    };
  }

  /**
   * Returns the child tree nodes for a root, definition or child node.
   *
   * @param node - node whose children are resolved
   * @returns child tree nodes, or an empty array for child nodes
   */
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

  let udtDefinitionsByName = $derived(
    Object.fromEntries(
      Object.values(collection.state).map((definition) => [definition.name, definition]),
    ),
  );

  let scriptPropertyKeys = $derived(
    activeChildTag ? tagPropertyKeys([activeChildTag], udtDefinitionsByName) : [],
  );

  /**
   * Creates a new child definition with default field values.
   *
   * @returns a new child tag input
   */
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

  /**
   * Returns a definition name unique among current definitions.
   *
   * @param base - proposed base name
   * @returns a unique definition name
   */
  function uniqueName(base: string) {
    const names = new Set(definitions.map((definition) => definition.name));
    let name = base;
    let count = 1;
    while (names.has(name)) name = `${base}${count++}`;
    return name;
  }

  /**
   * Validates and updates a definition by id, sorting its children.
   *
   * @param id - definition id to update
   * @param changes - partial definition fields, id excluded
   * @returns true when the update validated and was applied
   */
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

  /**
   * Updates a child within a definition by id.
   *
   * @param definitionId - definition containing the child
   * @param childId - child tag id to update
   * @param changes - partial child fields to apply
   * @returns true when the resulting definition validated and was applied
   */
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

  /**
   * Adds a new empty UDT definition and starts inline renaming.
   */
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

  /**
   * Appends a default child to a definition and starts inline renaming.
   *
   * @param definitionId - definition receiving the child
   */
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

  /**
   * Removes a UDT definition and clears any editor state pointing at it.
   *
   * @param id - definition id to remove
   */
  function deleteDefinition(id: string) {
    collection.remove(id);
    if (activeEditor?.definitionId === id) activeEditor = null;
    renamingId = null;
  }

  /**
   * Removes a child from a definition and closes its editor when active.
   *
   * @param definitionId - definition containing the child
   * @param childId - child tag id to remove
   */
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

  /**
   * Wraps a child definition as a tag input for the editor popover.
   *
   * @param definition - parent definition
   * @param child - child tag to wrap
   * @returns tag input with UDT linkage fields populated
   */
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

  /**
   * Strips UDT-specific and placement fields from tag changes.
   *
   * @param changes - tag changes to filter
   * @returns changes containing only child-editable fields
   */
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

  /**
   * Returns whether a child has a non-blank binding for a key.
   *
   * @param child - child tag to inspect
   * @param key - binding key to check
   * @returns true when the binding expression is non-blank
   */
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
   *
   * @param key - binding key to inspect
   * @returns bound and mixed flags for the active child
   */
  function childBindingState(key: TagBindingKey) {
    return {
      bound: Boolean(activeChild && isChildBound(activeChild, key)),
      mixed: false,
    };
  }

  /**
   * Returns the cached binding error for the active child.
   *
   * @param key - binding key to read
   * @returns the cached error message, or null when unavailable
   */
  function childBindingError(key: TagBindingKey) {
    return childBindingErrors.get(key) ?? null;
  }

  /**
   * Saves a binding expression on a child of the active definition.
   *
   * @param child - child tag to update
   * @param key - binding key to update
   * @param expression - binding expression to store, blank to clear
   */
  function saveChildBinding(child: UdtDefinitionTagInput, key: TagBindingKey, expression: string) {
    if (!activeDefinition) return;
    updateChild(activeDefinition.id, child.id, {
      bindings: updateBinding(child.bindings, key, null, expression),
    });
  }

  /**
   * Returns the active child's binding expression for a key.
   *
   * @param key - binding key to read
   * @returns the binding expression, or "" when unset
   */
  function childBindingValue(key: TagBindingKey) {
    return activeChild?.bindings?.[key] ?? "";
  }

  /**
   * Saves tag-style changes onto the active child definition.
   *
   * @param changes - tag changes to apply to the active child
   */
  function saveActiveChild(changes: Partial<Omit<TagOptionsInput, "id">>) {
    if (!activeDefinition || !activeChild) return;
    updateChild(
      activeDefinition.id,
      activeChild.id,
      childChanges(changes) as Partial<UdtDefinitionTagInput>,
    );
  }

  /**
   * Saves property changes onto the active child definition.
   *
   * @param updater - function producing the next properties from the current ones
   */
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

  /**
   * Saves a binding expression on the active child definition.
   *
   * @param key - binding key to update
   * @param expression - binding expression to store, blank to clear
   */
  function saveActiveChildBinding(key: TagBindingKey, expression: string) {
    if (!activeChild) return;
    saveChildBinding(activeChild, key, expression);
  }

  /**
   * Saves property changes onto the active definition.
   *
   * @param updater - function producing the next properties from the current ones
   */
  function saveDefinitionProperties(
    updater: (properties: UdtDefinitionInput["properties"]) => UdtDefinitionInput["properties"],
  ) {
    if (!activeDefinition) return;
    updateDefinitionById(activeDefinition.id, {
      properties: updater(activeDefinition.properties),
    });
  }

  /**
   * Opens the editor popover for a UDT definition.
   *
   * @param definition - definition to edit
   */
  function openDefinitionEditor(definition: UdtDefinitionInput) {
    activeEditor = { kind: "definition", definitionId: definition.id };
  }

  /**
   * Opens the editor popover for a child of a UDT definition.
   *
   * @param definition - parent definition
   * @param child - child tag to edit
   */
  function openChildEditor(definition: UdtDefinitionInput, child: UdtDefinitionTagInput) {
    activeEditor = { kind: "child", definitionId: definition.id, childId: child.id };
  }

  /**
   * Closes the active definition or child editor popover.
   */
  function closeEditor() {
    activeEditor = null;
  }

  /**
   * Commits an inline definition rename when the trimmed name is non-empty.
   *
   * @param definitionId - definition being renamed
   * @param newName - new definition name
   */
  function finalizeDefinitionRename(definitionId: string, newName: string) {
    renamingId = null;
    const name = newName.trim();
    if (name) updateDefinitionById(definitionId, { name });
  }

  /**
   * Commits an inline child rename when the trimmed name is non-empty.
   *
   * @param definitionId - definition containing the child
   * @param childId - child being renamed
   * @param newName - new child name
   */
  function finalizeChildRename(definitionId: string, childId: string, newName: string) {
    renamingId = null;
    const name = newName.trim();
    if (name) updateChild(definitionId, childId, { name });
  }

  /**
   * Opens the context menu for the UDT definition or child under the pointer.
   *
   * @param event - contextmenu event
   */
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

  /**
   * Handles a context menu action for the current UDT tree node.
   *
   * @param value - menu item value identifying the action
   */
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

  /**
   * Returns whether the current user may manage UDT definitions.
   *
   * @returns true when the user has the manage ability on UdtDefinition
   */
  function canManage() {
    return ability.can("manage", "UdtDefinition");
  }

  /**
   * Writes text to the system clipboard, reporting failures through formError.
   *
   * @param text - text to copy
   * @returns true on success, false when the write failed
   */
  async function copyToClipboard(text: string) {
    const result = await attempt(() => navigator.clipboard.writeText(text));
    if (result.isErr) {
      formError = `Clipboard write failed: ${errorToString(result.error)}`;
      return false;
    }
    return true;
  }

  /**
   * Reads text from the system clipboard, reporting failures through formError.
   *
   * @returns the clipboard text, or null when the read failed
   */
  async function readClipboard() {
    const result = await attempt(() => navigator.clipboard.readText());
    if (result.isErr) {
      formError = `Clipboard read failed: ${errorToString(result.error)}`;
      return null;
    }
    return result.data;
  }

  /**
   * Returns the tree node for the first selected tree value.
   *
   * @returns the selected tree node, or null when none is selected
   */
  function selectedTreeNode(): UdtTreeNode | null {
    const selected = treeView().selectedValue[0];
    if (!selected) return null;
    return collectionView.findNode(selected) ?? null;
  }

  /**
   * Resolves the definition associated with a tree node.
   *
   * @param node - tree node to resolve, may be null
   * @returns the related definition, or undefined when none applies
   */
  function definitionForNode(node: UdtTreeNode | null) {
    if (!node) return undefined;
    if (node.kind === "definition") return node.definition;
    if (node.kind === "child") return collection.state[node.definitionId];
    return undefined;
  }

  /**
   * Builds a clipboard payload for a definition or child tree node.
   *
   * @param node - tree node to serialize
   * @returns the clipboard payload, or null for root or missing nodes
   */
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

  /**
   * Copies a UDT definition or child node to the clipboard as JSON.
   *
   * @param node - tree node to copy
   * @returns true when the payload was written, false when unavailable or failed
   */
  async function copyNode(node: UdtTreeNode) {
    const payload = clipboardPayload(node);
    if (!payload) return false;
    formError = null;
    return copyToClipboard(JSON.stringify(payload));
  }

  /**
   * Copies a UDT node to the clipboard and removes it.
   *
   * @param node - tree node to cut
   */
  async function cutNode(node: UdtTreeNode) {
    if (!(await copyNode(node))) return;
    undoManager.beginTransaction();
    if (node.kind === "definition") deleteDefinition(node.definition.id);
    else if (node.kind === "child") removeChild(node.definitionId, node.child.id);
    undoManager.endTransaction();
  }

  /**
   * Returns a child name unique within a definition.
   *
   * @param definition - definition whose children are checked
   * @param base - proposed base name
   * @returns a unique child name
   */
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

  /**
   * Parses and validates a UDT clipboard payload.
   *
   * @param text - clipboard text to parse
   * @returns the parsed payload, or null when invalid
   */
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

  /**
   * Pastes a UDT definition or child payload into the tree.
   *
   * @param payload - clipboard payload to paste
   * @param target - tree node receiving a child payload
   * @returns true when the paste succeeded
   */
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

  /**
   * Reads the clipboard and pastes a UDT payload into the target.
   *
   * @param target - tree node receiving the pasted payload
   */
  async function pasteFromClipboard(target: UdtTreeNode | null) {
    const text = await readClipboard();
    if (text === null) return;
    const payload = parseClipboardPayload(text);
    if (!payload) return;
    pastePayload(payload, target);
  }

  /**
   * Handles a paste event on the UDT tree.
   *
   * @param event - clipboard paste event
   */
  async function handleTreePaste(event: ClipboardEvent) {
    event.stopPropagation();
    const text = event.clipboardData?.getData("text/plain");
    if (!text) return;
    event.preventDefault();
    const payload = parseClipboardPayload(text);
    if (!payload) return;
    pastePayload(payload, selectedTreeNode());
  }

  /**
   * Handles tree keyboard shortcuts for delete, rename, add child, copy and cut.
   *
   * @param event - keyup event from the UDT tree
   */
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
      propertyKeys={scriptPropertyKeys}
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
