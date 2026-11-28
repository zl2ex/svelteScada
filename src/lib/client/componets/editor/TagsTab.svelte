<script lang="ts">
  import {
    ChartNoAxesCombinedIcon,
    CircleAlertIcon,
    Copy,
    FolderIcon,
    FolderPlus,
    KeyboardIcon,
    Link2Icon,
    LoaderIcon,
    PencilIcon,
    Scissors,
    TagIcon,
    TagPlus,
    TimelineIcon,
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
  import type { TagProperties } from "$lib/sqlite/tagProperties";
  import type { PropertyMap } from "$lib/propertyValue";
  import { attempt } from "$lib/util/attempt";
  import { newId } from "$lib/util/newId";
  import { err, ok } from "neverthrow";
  import { z_TagFolderNodeInsert } from "$lib/sqlite/tables/index";
  import { z_TagOptionsInsert } from "$lib/sqlite/tagOptions";
  import { browser } from "$app/env";
  import { tagFolderPatches, applyTagFolderPatches } from "$live/tag-folder";
  import { PatchCollection } from "$lib/client/live/patchCollection.svelte";
  import type { BaseTypeStrings, TagOptionsInput } from "$lib/server/tag/tag";
  import { onMount, untrack } from "svelte";
  import TagInput from "$lib/client/componets/scada/TagInput.svelte";
  import { getEditorContext } from "$lib/client/editor/editorContext";
  import { baseTypeKeys } from "$lib/validation/baseTypes";
  import type { UdtDefinitionInput } from "$lib/sqlite/tables/udt_definitions";
  import { getUdtDefinitionsContext } from "$lib/client/editor/udtDefinitionContext";
  import {
    errorToString,
    neverThrowErrorToString,
    type NeverThrowError,
  } from "$lib/util/neverThrow";
  import { undoManager } from "$lib/client/history/undoManager";
  import { commitOrRevert, focusOnMount } from "$lib/client/util/use";
  import TagEditorPopover from "./TagEditorPopover.svelte";
  import { buildEffectiveUdtRows } from "$lib/client/editor/udtBuilder";
  import { rebuildUdtInstances } from "$lib/client/editor/udtInstanceRebuild";
  import { updateBinding } from "$lib/client/editor/bindings";
  import { getScriptEvaluatorContext } from "$lib/client/editor/scriptEvaluatorContext";
  import { tagBindingKeys, type TagBindingKey } from "$lib/tagBindings";
  import { getAbilityContext } from "$lib/client/permissions/abilityContext";
  import {
    readTreeDragData,
    writeTreeDragData,
    type TreeDragPayload,
  } from "$lib/client/util/dragging";
  import { getTagValueMapContext } from "$lib/client/live/tagMapContext";
  import { getTagCollectionContext } from "$lib/client/editor/tagCollectionContext";
  import { isTagOptions, isUdtTag } from "$lib/util/tag";
  import { inheritedTagFieldValue } from "$lib/client/editor/udtOverrides";
  import { tagPropertyKeys } from "$lib/client/editor/propertyKeys";

  let {
    tagFolders,
  }: {
    tagFolders: Record<string, ClosureTableNode>;
  } = $props();

  const editor = getEditorContext();
  const ability = getAbilityContext();
  const tagValueMap = getTagValueMapContext();
  const udtDefinitionsCollection = getUdtDefinitionsContext();
  const tagPatchesCollection = getTagCollectionContext();
  const editorEvaluator = getScriptEvaluatorContext();

  let udtDefinitionsByName = $derived(
    Object.fromEntries(
      Object.values(udtDefinitionsCollection.state).map((definition) => [
        definition.name,
        definition,
      ]),
    ) as Record<string, UdtDefinitionInput>,
  );
  let tagDataTypes = $derived(
    [...baseTypeKeys, ...Object.keys(udtDefinitionsByName)].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
    ),
  );

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

  undoManager.register("folders", tagFolderPatchesCollection);

  onMount(() => {
    rebuildUdtInstances(tagPatchesCollection, udtDefinitionsCollection);

    return () => {
      undoManager.unregister("folders");
      tagFolderPatchesCollection.dispose();
    };
  });

  /**
   * Returns the effective property map stored on the tag row.
   *
   * @param tag - tag options whose properties are read
   * @returns the tag properties, or an empty map when unset
   */
  function propertiesForTag(tag: TagOptionsInput): TagProperties {
    return (tag.properties ?? {}) as TagProperties;
  }

  /**
   * Resolves a tag config through the script evaluator.
   *
   * @param config - tag options to resolve
   * @returns the resolved tag options
   */
  function resolvedTagConfig(config: TagOptionsInput) {
    return editorEvaluator.resolveTagConfig(config);
  }

  /**
   * Saves a partial change to a tag after resolving the resulting config.
   *
   * @param node - existing tag options
   * @param changes - partial tag fields to apply
   */
  function saveTagConfig(node: TagOptionsInput, changes: Partial<Omit<TagOptionsInput, "id">>) {
    const resolved = resolvedTagConfig({ ...node, ...changes });
    tagPatchesCollection.update(node.id, resolved);
  }

  /**
   * Adds a resolved tag, expanding UDT definitions into effective rows when applicable.
   *
   * @param config - tag options to resolve and add
   */
  function addResolvedTag(config: TagOptionsInput) {
    const resolved = resolvedTagConfig(config);
    const definition = udtDefinitionsByName[resolved.dataType];
    if (!definition) {
      tagPatchesCollection.add(resolved);
      return;
    }

    tagPatchesCollection.addMany(
      buildEffectiveUdtRows({ ...resolved, udtDefinitionId: definition.id }, udtDefinitionsByName),
    );
  }

  /**
   * Returns the effective binding expressions for a tag, including UDT instance overrides.
   *
   * @param node - tag options whose bindings are read
   * @returns merge of top-level bindings and UDT override bindings
   */
  function bindingsForTag(node: TagOptionsInput) {
    return { ...(node.bindings ?? {}), ...(node.udtOverrides?.bindings ?? {}) };
  }

  /**
   * Returns whether a tag binding is configured.
   *
   * @param node - tag options to inspect
   * @param key - binding key to check
   * @returns true when the effective binding expression is non-blank
   */
  function isTagBound(node: TagOptionsInput, key: TagBindingKey) {
    return Boolean(bindingsForTag(node)[key]?.trim());
  }

  let activeTagId = $state<string | null>(null);

  let activeTag = $derived(activeTagId ? tagPatchesCollection.state[activeTagId] : undefined);

  let selectedTags = $derived(
    editor.tagSelectionIds.flatMap((id) => {
      const tag = tagPatchesCollection.state[id];
      return tag ? [tag] : [];
    }),
  );

  let lockedPropertyKeys = $derived(
    new Set(
      selectedTags.flatMap((tag) =>
        Object.keys(udtDefinitionsByName[tag.dataType]?.properties ?? {}),
      ),
    ),
  );

  let scriptPropertyKeys = $derived(tagPropertyKeys(selectedTags, udtDefinitionsByName));

  /**
   * Selects a tag if needed and opens its editor popover.
   *
   * @param tag - tag to open in the editor
   */
  function openTagEditor(tag: TagOptionsInput) {
    if (!editor.tagSelectionIds.includes(tag.id)) {
      editor.tagSelectionIds = [tag.id];
      treeView().setSelectedValue([tag.id]);
    }
    activeTagId = tag.id;
  }

  /**
   * Closes the active tag editor popover.
   */
  function closeTagEditor() {
    activeTagId = null;
  }

  $effect(() => {
    if (activeTagId && (!tagPatchesCollection.state[activeTagId] || selectedTags.length === 0)) {
      activeTagId = null;
    }
  });

  /**
   * Returns whether a tag represents a UDT definition or child instance.
   *
   * @param tag - tag options to inspect
   * @returns true when the tag is linked to a UDT definition
   */
  function isUdtInstance(tag: TagOptionsInput): boolean {
    return Boolean(
      tag.udtDefinitionChildId || tag.udtDefinitionId || udtDefinitionsByName[tag.dataType],
    );
  }

  /**
   * Compares two values by their JSON serialization.
   *
   * @param a - first value to compare
   * @param b - second value to compare
   * @returns true when both values serialize identically
   */
  function sameValue(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  /**
   * Saves edits to selected tags.
   * UDT rows write effective values to the top level and keep explicit override differences
   * in `udtOverrides` for indicators and later reset behavior.
   *
   * @param changes - partial tag fields to apply to every selected tag
   */
  function saveSelectedTags(changes: Partial<Omit<TagOptionsInput, "id">>) {
    if (selectedTags.length === 0) return;

    const rebuildChildren = "dataType" in changes || "properties" in changes;

    undoManager.beginTransaction();
    tagPatchesCollection.updateMany(
      selectedTags.map((tag) => {
        const next = resolvedTagConfig({ ...tag, ...changes });

        if (!isUdtInstance(tag)) {
          return { id: tag.id, changes: next };
        }

        const overrides = { ...(tag.udtOverrides ?? {}) };

        for (const key of Object.keys(changes)) {
          if (key === "properties" || key === "bindings" || key === "id") continue;

          if (["dataType", "folderId", "name", "parentTagId"].includes(key)) {
            delete (overrides as Record<string, unknown>)[key];
            continue;
          }

          const nextValue = (next as Record<string, unknown>)[key];
          const inherited = inheritedTagFieldValue(
            tag,
            key as keyof TagOptionsInput,
            udtDefinitionsByName,
            tagPatchesCollection.state,
          );

          if (sameValue(nextValue, inherited)) {
            delete (overrides as Record<string, unknown>)[key];
          } else {
            (overrides as Record<string, unknown>)[key] = nextValue;
          }
        }

        if ("dataType" in changes) {
          const definition = udtDefinitionsByName[next.dataType];
          next.udtDefinitionId = definition?.id ?? null;
        }

        return {
          id: tag.id,
          changes: {
            ...next,
            udtOverrides: Object.keys(overrides).length > 0 ? overrides : null,
          },
        };
      }),
    );
    undoManager.endTransaction();

    if (rebuildChildren) {
      rebuildUdtInstances(tagPatchesCollection, udtDefinitionsCollection);
    }
  }

  /**
   * Saves property edits, writing effective properties to the top level and keeping
   * explicit property differences in `udtOverrides.properties`.
   *
   * @param updater - function producing the next properties from the current ones
   */
  function updateSelectedTagProperties(updater: (properties: TagProperties) => TagProperties) {
    if (selectedTags.length === 0) return;
    undoManager.beginTransaction();
    tagPatchesCollection.updateMany(
      selectedTags.map((tag) => {
        const nextProperties = updater(propertiesForTag(tag));

        if (!isUdtInstance(tag)) {
          return {
            id: tag.id,
            changes: { properties: nextProperties, updatedAt: Date.now() },
          };
        }

        const overrides = { ...(tag.udtOverrides ?? {}) };
        const propertyOverrides = { ...(overrides.properties ?? {}) };
        const parent = tag.parentTagId ? tagPatchesCollection.state[tag.parentTagId] : undefined;
        const baseProperties = (
          tag.udtDefinitionChildId
            ? (parent?.properties ?? {})
            : (udtDefinitionsByName[tag.dataType]?.properties ?? {})
        ) as TagProperties;

        const keys = new Set([
          ...Object.keys(baseProperties),
          ...Object.keys(nextProperties),
          ...Object.keys(propertyOverrides),
        ]);

        for (const key of keys) {
          const nextValue = nextProperties[key];
          const baseValue = baseProperties[key];
          if (nextValue === undefined || sameValue(nextValue, baseValue)) {
            delete propertyOverrides[key];
          } else {
            propertyOverrides[key] = nextValue as PropertyMap[string];
          }
        }

        if (Object.keys(propertyOverrides).length > 0) {
          overrides.properties = propertyOverrides;
        } else {
          delete overrides.properties;
        }

        return {
          id: tag.id,
          changes: {
            properties: nextProperties,
            udtOverrides: Object.keys(overrides).length > 0 ? overrides : null,
            updatedAt: Date.now(),
          },
        };
      }),
    );
    undoManager.endTransaction();
    rebuildUdtInstances(tagPatchesCollection, udtDefinitionsCollection);
  }

  /**
   * Returns the shared binding value for the selection, or an empty string when mixed.
   *
   * @param key - binding key to read
   * @returns the common binding expression, or "" when the selection differs or is empty
   */
  function selectedBindingValue(key: TagBindingKey) {
    if (selectedTags.length === 0) return "";
    const first = bindingsForTag(selectedTags[0])[key] ?? "";
    return selectedTags.every((tag) => (bindingsForTag(tag)[key] ?? "") === first) ? first : "";
  }

  /**
   * Returns whether selected tags have differing binding expressions for a key.
   *
   * @param key - binding key to compare
   * @returns true when any selected tag differs from the first
   */
  function selectedBindingMixed(key: TagBindingKey) {
    if (selectedTags.length === 0) return false;
    const first = bindingsForTag(selectedTags[0])[key] ?? "";
    return selectedTags.some((tag) => (bindingsForTag(tag)[key] ?? "") !== first);
  }

  /**
   * Returns bound/mixed state for a field without evaluating the binding.
   *
   * @param key - binding key to inspect
   * @returns bound and mixed flags for the selection
   */
  function selectedBindingState(key: TagBindingKey) {
    const boundTags = selectedTags.filter((tag) => isTagBound(tag, key));
    return {
      bound: boundTags.length > 0,
      mixed: boundTags.length > 0 && boundTags.length !== selectedTags.length,
    };
  }

  /**
   * Caches binding errors for selected tags so the popover can display them without
   * evaluating binding values again.
   */
  let selectedBindingErrors = $derived.by(() => {
    const errors = new Map<string, string | null>();

    for (const tag of selectedTags) {
      const bindings = bindingsForTag(tag);
      for (const key of tagBindingKeys) {
        const expression = bindings[key];
        if (!expression?.trim()) continue;

        const evaluation = editorEvaluator.evaluateTagFor(tag, expression);
        errors.set(
          `${tag.id}:${key}`,
          evaluation.isErr() ? neverThrowErrorToString(evaluation.error) : null,
        );
      }
    }

    return errors;
  });

  /**
   * Returns the cached binding error for the first selected tag when expressions are not mixed.
   *
   * @param key - binding key to read
   * @returns the cached error message, or null when unavailable
   */
  function selectedBindingError(key: TagBindingKey) {
    if (selectedTags.length === 0 || selectedBindingMixed(key)) return null;
    return selectedBindingErrors.get(`${selectedTags[0].id}:${key}`) ?? null;
  }

  /**
   * Saves a binding expression for the selected tags.
   * For UDT instances, the expression is stored as an override binding and its resolved value
   * is written directly to the effective top-level field sent to the server.
   *
   * @param key - binding key to update
   * @param expression - binding expression to store, blank to clear
   */
  function saveSelectedBinding(key: TagBindingKey, expression: string) {
    if (selectedTags.length === 0) return;

    undoManager.beginTransaction();
    tagPatchesCollection.updateMany(
      selectedTags.map((tag) => {
        const overrides = { ...(tag.udtOverrides ?? {}) };
        const bindingOverrides = { ...(overrides.bindings ?? {}) };
        const effectiveBindings = bindingsForTag(tag);
        const nextBindings = updateBinding(effectiveBindings, key, null, expression);

        if (!isUdtInstance(tag)) {
          return {
            id: tag.id,
            changes: resolvedTagConfig({ ...tag, bindings: nextBindings }),
          };
        }

        if (expression.trim()) {
          bindingOverrides[key] = expression;
          delete (overrides as Record<string, unknown>)[key];
          overrides.bindings = bindingOverrides;

          const evaluation = editorEvaluator.evaluateTagFor(tag, expression);
          const changes: Record<string, unknown> = {
            udtOverrides: overrides,
          };
          if (evaluation.isOk() && evaluation.value !== undefined) {
            changes[key] = evaluation.value;
          }

          return {
            id: tag.id,
            changes: changes as Partial<Omit<TagOptionsInput, "id">>,
          };
        }

        delete bindingOverrides[key];
        if (Object.keys(bindingOverrides).length > 0) {
          overrides.bindings = bindingOverrides;
        } else {
          delete overrides.bindings;
        }
        delete (overrides as Record<string, unknown>)[key];

        const baseExpression = tag.bindings?.[key];
        const changes: Record<string, unknown> = {
          udtOverrides: Object.keys(overrides).length > 0 ? overrides : null,
        };

        if (baseExpression?.trim()) {
          const evaluation = editorEvaluator.evaluateTagFor(
            { ...tag, ...overrides },
            baseExpression,
          );
          if (evaluation.isOk() && evaluation.value !== undefined) {
            changes[key] = evaluation.value;
          }
        } else {
          changes[key] = inheritedTagFieldValue(
            tag,
            key,
            udtDefinitionsByName,
            tagPatchesCollection.state,
          );
        }

        return {
          id: tag.id,
          changes: changes as Partial<Omit<TagOptionsInput, "id">>,
        };
      }),
    );
    undoManager.endTransaction();
  }

  /**
   * Returns whether any selected tag has an explicit property override for a key.
   *
   * @param key - property key to check
   * @returns true when at least one selected tag overrides the property
   */
  function hasSelectedPropertyOverride(key: string) {
    return selectedTags.some(
      (tag) =>
        !!tag.udtOverrides?.properties &&
        Object.prototype.hasOwnProperty.call(tag.udtOverrides.properties, key),
    );
  }

  /**
   * Clears a property override and restores the inherited/default property value.
   *
   * @param key - property key whose override is cleared
   */
  function clearSelectedPropertyOverride(key: string) {
    if (selectedTags.length === 0) return;

    const targets = selectedTags.filter(
      (tag) =>
        !!tag.udtOverrides?.properties &&
        Object.prototype.hasOwnProperty.call(tag.udtOverrides.properties, key),
    );
    if (targets.length === 0) return;

    undoManager.beginTransaction();
    tagPatchesCollection.updateMany(
      targets.map((tag) => {
        const udtOverrides = { ...(tag.udtOverrides ?? {}) };
        const explicitProperties = { ...(udtOverrides.properties ?? {}) };
        delete explicitProperties[key];
        if (Object.keys(explicitProperties).length > 0) {
          udtOverrides.properties = explicitProperties;
        } else {
          delete udtOverrides.properties;
        }

        const parent = tag.parentTagId ? tagPatchesCollection.state[tag.parentTagId] : undefined;
        const baseProperties = (
          tag.udtDefinitionChildId
            ? (parent?.properties ?? {})
            : (udtDefinitionsByName[tag.dataType]?.properties ?? {})
        ) as TagProperties;
        const properties = { ...(tag.properties ?? {}) } as TagProperties;
        const inheritedProperty = baseProperties[key];
        if (inheritedProperty) properties[key] = inheritedProperty;
        else delete properties[key];

        return {
          id: tag.id,
          changes: {
            properties,
            udtOverrides: Object.keys(udtOverrides).length > 0 ? udtOverrides : null,
          },
        };
      }),
    );
    undoManager.endTransaction();
    rebuildUdtInstances(tagPatchesCollection, udtDefinitionsCollection);
  }

  /**
   * Returns whether any selected tag has an explicit top-level UDT override.
   *
   * @param key - override key to check
   * @returns true when at least one selected tag overrides the key
   */
  function hasSelectedOverride(key: string) {
    return selectedTags.some(
      (tag) => !!tag.udtOverrides && Object.prototype.hasOwnProperty.call(tag.udtOverrides, key),
    );
  }

  /**
   * Clears a top-level override and restores the value inherited from the UDT definition.
   *
   * @param key - override key whose value is restored
   */
  function clearSelectedOverride(key: string) {
    if (selectedTags.length === 0) return;

    const targets = selectedTags.filter(
      (tag) => !!tag.udtOverrides && Object.prototype.hasOwnProperty.call(tag.udtOverrides, key),
    );
    if (targets.length === 0) return;

    undoManager.beginTransaction();
    tagPatchesCollection.updateMany(
      targets.map((tag) => {
        const udtOverrides = { ...(tag.udtOverrides ?? {}) };
        delete (udtOverrides as Record<string, unknown>)[key];
        if (udtOverrides.bindings) {
          const bindings = { ...udtOverrides.bindings };
          delete bindings[key as TagBindingKey];
          if (Object.keys(bindings).length > 0) udtOverrides.bindings = bindings;
          else delete udtOverrides.bindings;
        }

        const changes = {
          udtOverrides: Object.keys(udtOverrides).length > 0 ? udtOverrides : null,
          [key]: inheritedTagFieldValue(
            tag,
            key as keyof TagOptionsInput,
            udtDefinitionsByName,
            tagPatchesCollection.state,
          ),
        };

        return {
          id: tag.id,
          changes: changes as Partial<Omit<TagOptionsInput, "id">>,
        };
      }),
    );
    undoManager.endTransaction();
    rebuildUdtInstances(tagPatchesCollection, udtDefinitionsCollection);
  }

  let dragging = $state<TreeDragPayload | null>(null);
  let dropFolderId = $state<string | null>(null);

  /**
   * Clears the current drag payload and drop target highlight.
   */
  function clearTagDrag() {
    dragging = null;
    dropFolderId = null;
  }

  /**
   * Starts dragging a tag or folder and writes the payload to the data transfer.
   *
   * @param ev - drag start event
   * @param node - tag or folder being dragged
   */
  function handleTagDragStart(ev: DragEvent, node: ClosureTableNode | TagOptionsInput) {
    const payload: TreeDragPayload = isClosureTableNode(node)
      ? { kind: "tag-folder", id: node.id }
      : { kind: "tag", id: node.id };
    ev.stopPropagation();
    dragging = payload;
    writeTreeDragData(ev, payload);
  }

  /**
   * Returns whether a folder sits below an ancestor folder, including staged folders.
   *
   * @param candidateId - folder id to test
   * @param ancestorId - potential ancestor folder id
   * @returns true when candidate is a descendant of ancestor
   */
  function isFolderDescendant(candidateId: string, ancestorId: string) {
    const allFolders = {
      ...tagFolderPatchesCollection.state,
      ...stagingFolders,
    };
    let current: ClosureTableNode | undefined = allFolders[candidateId];
    while (current) {
      if (current.parentId === ancestorId) return true;
      current = current.parentId ? allFolders[current.parentId] : undefined;
    }
    return false;
  }

  /**
   * Returns whether the current drag payload may be dropped on a folder.
   *
   * @param targetId - destination folder id
   * @returns true when the drop is allowed
   */
  function canDropOnFolder(targetId: string) {
    if (!dragging) return false;
    if (dragging.kind === "tag") return true;
    if (dragging.kind !== "tag-folder") return false;
    if (dragging.id === targetId) return false;
    return !isFolderDescendant(targetId, dragging.id);
  }

  /**
   * Updates the drop highlight and transfer effect while dragging over a folder.
   *
   * @param ev - drag over event
   * @param targetId - folder being hovered
   */
  function handleTagDragOver(ev: DragEvent, targetId: string) {
    if (!canDropOnFolder(targetId)) {
      ev.stopPropagation();
      if (dropFolderId === targetId) dropFolderId = null;
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = "none";
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
    if (dropFolderId !== targetId) dropFolderId = targetId;
  }

  /**
   * Clears the drop highlight when leaving a folder without entering a child.
   *
   * @param ev - drag leave event
   * @param targetId - folder being left
   */
  function handleTagDragLeave(ev: DragEvent, targetId: string) {
    const current = ev.currentTarget;
    if (
      current instanceof Node &&
      ev.relatedTarget instanceof Node &&
      current.contains(ev.relatedTarget)
    ) {
      return;
    }
    if (dropFolderId === targetId) dropFolderId = null;
  }

  /**
   * Moves or reparents the dragged tag or folder into the target folder.
   *
   * @param ev - drop event
   * @param targetFolder - folder receiving the drop
   */
  function handleTagDrop(ev: DragEvent, targetFolder: ClosureTableNode) {
    const payload = dragging ?? readTreeDragData(ev);
    if (!payload) {
      clearTagDrag();
      return;
    }
    if (payload.kind === "tag-folder") {
      if (payload.id === targetFolder.id) {
        ev.stopPropagation();
        clearTagDrag();
        return;
      }
      if (isFolderDescendant(targetFolder.id, payload.id)) {
        ev.stopPropagation();
        clearTagDrag();
        return;
      }
    }

    ev.preventDefault();
    ev.stopPropagation();

    if (payload.kind === "tag") {
      const staging = stagingTags[payload.id];
      if (staging) {
        staging.folderId = targetFolder.id;
      } else {
        const tag = tagPatchesCollection.state[payload.id];
        if (tag) saveTagConfig(tag, { folderId: targetFolder.id });
      }
    } else if (payload.kind === "tag-folder") {
      const staging = stagingFolders[payload.id];
      if (staging) {
        staging.parentId = targetFolder.id;
      } else {
        tagFolderPatchesCollection.update(payload.id, { parentId: targetFolder.id });
      }
    }

    clearTagDrag();
  }

  let collection = $state(
    createTreeViewCollection<ClosureTableNode | TagOptionsInput>({
      nodeToValue: (node) => node.id,
      nodeToString: (node) => node.name,
      nodeToChildren: (node) => {
        if (isTagOptions(node)) {
          return Object.values({
            ...tagPatchesCollection.state,
            ...stagingTags,
          }).filter((tag) => tag.parentTagId === node.id);
        }
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

  /**
   * Loads the persisted expanded tree ids from local storage.
   *
   * @returns stored id list, or an empty array outside the browser or on error
   */
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

  /**
   * Expands every ancestor folder of the given tree ids.
   *
   * @param ids - selected tag or folder ids to reveal
   */
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

  /**
   * Narrows an object to a closure table folder node.
   *
   * @param node - object to test
   * @returns true when the object has folder id, name and parentId fields
   */
  function isClosureTableNode(node: object): node is ClosureTableNode {
    return (
      Object.hasOwn(node, "id") && Object.hasOwn(node, "name") && Object.hasOwn(node, "parentId")
    );
  }

  /**
   * Resolves tree ids into folder and tag records, including staged items.
   *
   * @param values - tree node ids to resolve
   * @returns collected folders and tags
   */
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

  /**
   * Resolves the current tree selection into folder and tag records.
   *
   * @returns collected folders and tags for the selection
   */
  function getSelectedItems() {
    return collectItems(treeView().selectedValue);
  }

  // ── Keyboard shortcuts ────────────────────────────────

  /**
   * Writes text to the system clipboard.
   *
   * @param text - text to copy
   * @returns ok(null) on success, or an err with CLIPBOARD_WRITE_FAILED
   */
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

  /**
   * Recursively collects tags inside the given folders.
   *
   * @param nodes - folders whose descendant tags are collected
   * @returns tags in the folders and all nested subfolders
   */
  function getChildTags(nodes: ClosureTableNode[]): TagOptionsInput[] {
    return nodes.flatMap((n) => {
      let childTags = Object.values(tagPatchesCollection.state).filter((f) => f.folderId == n.id);
      let childFolders = Object.values(tagFolderPatchesCollection.state).filter(
        (f) => f.parentId == n.id,
      );
      return [...childTags, ...getChildTags(childFolders)];
    });
  }

  /**
   * Recursively collects child folders of the given folders.
   *
   * @param nodes - folders whose descendants are collected
   * @returns all nested child folders
   */
  function getChildFolders(nodes: ClosureTableNode[]): ClosureTableNode[] {
    return nodes.flatMap((n) => {
      let childFolders = Object.values(tagFolderPatchesCollection.state).filter(
        (f) => f.parentId == n.id,
      );
      return [...childFolders, ...getChildFolders(childFolders)];
    });
  }

  /**
   * Deletes the given folders together with every nested folder and tag.
   *
   * @param nodes - folders to delete
   */
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

  /**
   * Copies folder references to the clipboard and deletes the folders.
   *
   * @param nodes - folders to cut
   */
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

  /**
   * Copies tags to the clipboard and removes them.
   *
   * @param tags - tags to cut
   */
  async function tagsCut(tags: TagOptionsInput[]) {
    const copied = await copyToClipboard(JSON.stringify(tags));
    if (copied.isErr()) {
      console.error(`tagsCut() ${neverThrowErrorToString(copied.error)}`);
    }
    tagPatchesCollection.removeMany(tags.map((t) => t.id));
  }

  /**
   * Removes the given tags.
   *
   * @param tags - tags to remove
   */
  function tagsDelete(tags: TagOptionsInput[]) {
    tagPatchesCollection.removeMany(tags.map((t) => t.id));
  }

  // ── Global tree keyboard handler ──────────────────────

  /**
   * Handles tree keyboard shortcuts for delete, rename, add, copy, path copy and cut.
   *
   * @param e - keyup event from the tree
   */
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

    if (e.key === "q" && e.ctrlKey) {
      // copy path of tag
      if (!onlyOneTag) return;
      const copied = await copyToClipboard(tagValueMap.tagValue(tags[0].id)?.path ?? "");
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

  /**
   * Opens the context menu for the tag or folder under the pointer and syncs selection.
   *
   * @param event - contextmenu event
   */
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

  /**
   * Creates a staged folder under the parent and starts inline renaming.
   *
   * @param parentNode - folder that will contain the new folder
   */
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

  /**
   * Creates a staged tag under the parent and starts inline renaming.
   *
   * @param parentNode - folder that will contain the new tag
   */
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

  /**
   * Commits an inline folder rename, creating a staged folder when needed.
   *
   * @param id - id of the folder being renamed
   * @param newName - new folder name
   */
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

  /**
   * Cancels an inline folder rename and drops any staged folder.
   *
   * @param id - id of the folder being renamed
   */
  function cancelFolderRename(id: string) {
    if (renamingId !== id) return;
    renamingId = null;
    delete stagingFolders[id];
  }

  /**
   * Commits an inline tag rename, adding a staged tag when needed.
   *
   * @param id - id of the tag being renamed
   * @param newName - new tag name
   */
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

  /**
   * Cancels an inline tag rename and drops any staged tag.
   *
   * @param id - id of the tag being renamed
   */
  function cancelTagRename(id: string) {
    if (renamingId !== id) return;
    renamingId = null;
    delete stagingTags[id];
  }

  /**
   * Checks for duplicate tag names in a specific folder and returns a new unique name if needed.
   *
   * @param name - proposed tag name
   * @param parentNode - folder that will own the tag
   * @returns a unique tag name
   */
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

  /**
   * Checks for duplicate folder names in a specific folder and returns a unique name if needed.
   *
   * @param name - proposed folder name
   * @param parentNode - parent folder that will contain it
   * @returns a unique folder name
   */
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

  /**
   * Reads text from the system clipboard.
   *
   * @returns ok with the clipboard text, or an err with CLIPBOARD_READ_FAILED
   */
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

  /**
   * Parses pasted JSON and inserts the contained tags and folders.
   *
   * @param text - pasted clipboard text
   * @param parentNode - folder receiving the pasted items
   * @returns ok(null) on success, or an err describing invalid input
   */
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
      if (tagResult.data) tags.push(tagResult.data as TagOptionsInput);
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
        driverPath: tag.driverPath ?? null,
        readonly: tag.readonly ?? false,
        exposeOverOpcua: tag.exposeOverOpcua ?? true,
        properties: tag.properties ?? null,
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

  /**
   * Handles a paste event by reading text and inserting the parsed items.
   *
   * @param e - clipboard paste event
   * @param parentNode - folder receiving the pasted items
   */
  async function handlePaste(e: ClipboardEvent, parentNode: ClosureTableNode | undefined) {
    const text = e.clipboardData?.getData("text/plain");
    e.stopPropagation();
    if (!text) return;
    const result = handlePasteText(text, parentNode);
    if (result.isErr()) {
      console.error(`handlePaste() ${neverThrowErrorToString(result.error)}`);
    }
  }

  /**
   * Handles a context menu action for the current folder or tag selection.
   *
   * @param value - menu item value identifying the action
   */
  async function handleMenuSelect(value: string) {
    switch (value) {
      case "rename": {
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

      case "copyPath":
        if (contextMenuFolders.length != 0 && contextMenuTags.length != 1) return;
        const copied = await copyToClipboard(
          tagValueMap.tagValue(contextMenuTags[0].id)?.path ?? "",
        );
        if (copied.isErr()) {
          console.error(`copy() ${neverThrowErrorToString(copied.error)}`);
        }
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

{#snippet tagTrigger(node: TagOptionsInput, openEditor: () => void)}
  {@const bindingError = editorEvaluator.tagError(node)}
  <span class="relative flex w-full min-w-0">
    <button
      type="button"
      onclick={(ev) => ev.preventDefault()}
      ondblclick={openEditor}
      tabindex={-1}
      class="w-full flex items-center justify-between gap-4 min-w-0 focus-visible:outline-none"
    >
      <div class="flex items-center gap-2 min-w-0 w-full">
        {#if isUdtTag(node)}
          <TimelineIcon class="size-5 shrink-0 opacity-60" />
        {:else}
          <TagIcon class="size-4 shrink-0 opacity-60" />
        {/if}
        {#if renamingId === node.id}
          <input
            type="text"
            class="input p-1 text-xs grow"
            value={node.name}
            use:focusOnMount
            {@attach commitOrRevert(
              (value) => finalizeTagRename(node.id, value),
              "string",
              () => cancelTagRename(node.id),
              { commitOnUnchanged: true },
            )}
          />
        {:else}
          <span class="truncate" title={`${node.name}\n${node.dataType}`}>{node.name}</span>

          {#if node.trendEnabled}
            <ChartNoAxesCombinedIcon class="size-4 shrink-0 opacity-50" title="trend active" />
          {/if}

          {#if node.driverPath}
            <KeyboardIcon class="size-4 shrink-0 opacity-50" title="driver connection active" />
          {/if}

          {#if node.bindings}
            <Link2Icon class="size-4 shrink-0 opacity-50" title="bindings active" />
          {/if}

          <CircleAlertIcon
            class={bindingError
              ? "size-4 shrink-0 text-error-500 opacity-100"
              : "size-4 shrink-0 text-error-500 opacity-0"}
            aria-hidden={!bindingError}
            title={bindingError
              ? `${bindingError.scope}${bindingError.key ? `.${bindingError.key}` : ""}: ${bindingError.message}`
              : undefined}
          />
        {/if}
      </div>
      {#if renamingId !== node.id}
        {#if isUdtTag(node)}
          <span class="opacity-70">{node.dataType}</span>
        {:else}
          <TagInput
            id={node.id}
            label=""
            class="py-0 px-2 border-none max-w-40 rounded-sm"
            onclick={(ev) => ev.stopPropagation()}
            onkeydown={(ev) => ev.stopPropagation()}
          />
        {/if}
      {/if}
    </button>

    {#if activeTagId === node.id}
      <Popover.Anchor class="pointer-events-none absolute inset-0" />
    {/if}
  </span>
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
        <TreeView.BranchControl
          data-folder-id={node.id}
          data-drop={dropFolderId === node.id ? "inside" : undefined}
          draggable="true"
          ondragstart={(ev) => handleTagDragStart(ev, node)}
          ondragend={clearTagDrag}
          ondragover={(ev) => handleTagDragOver(ev, node.id)}
          ondragleave={(ev) => handleTagDragLeave(ev, node.id)}
          ondrop={(ev) => handleTagDrop(ev, node)}
        >
          <TreeView.BranchIndicator />
          <TreeView.BranchText class="truncate w-full">
            <FolderIcon class="size-4 shrink-0 opacity-60" />

            {#if renamingId === node.id}
              <input
                type="text"
                class="input p-0 text-xs grow"
                value={node.name}
                use:focusOnMount
                {@attach commitOrRevert(
                  (value) => finalizeFolderRename(node.id, value),
                  "string",
                  () => cancelFolderRename(node.id),
                  { commitOnUnchanged: true },
                )}
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
      {@const childTags = Object.values({
        ...tagPatchesCollection.state,
        ...stagingTags,
      }).filter((tag) => tag.parentTagId === node.id)}

      {#if isUdtTag(node) || childTags.length > 0}
        <TreeView.Branch>
          <TreeView.BranchControl
            data-tag-id={node.id}
            draggable="true"
            ondragstart={(ev) => handleTagDragStart(ev, node)}
            ondragend={clearTagDrag}
          >
            <TreeView.BranchIndicator />
            <TreeView.BranchText class="truncate w-full">
              {@render tagTrigger(node, () => openTagEditor(node))}
            </TreeView.BranchText>
          </TreeView.BranchControl>
          <TreeView.BranchContent>
            <TreeView.BranchIndentGuide />
            {#each childTags as child, childIndex (child.id)}
              {@render treeNode(child, [...indexPath, childIndex])}
            {/each}
          </TreeView.BranchContent>
        </TreeView.Branch>
      {:else}
        <TreeView.Item
          data-tag-id={node.id}
          draggable="true"
          ondragstart={(ev) => handleTagDragStart(ev, node)}
          ondragend={clearTagDrag}
        >
          {@render tagTrigger(node, () => openTagEditor(node))}
        </TreeView.Item>
      {/if}
    {/if}
  </TreeView.NodeProvider>
{/snippet}

<Popover
  open={activeTagId !== null}
  onOpenChange={(details) => {
    if (!details.open) closeTagEditor();
  }}
  positioning={{ placement: "right-end", offset: { mainAxis: 48 } }}
>
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
          {#if (contextMenuFolders.length === 1 && contextMenuTags.length === 0) || (contextMenuFolders.length === 0 && contextMenuTags.length === 1)}
            <Menu.Item value="rename">
              <Menu.ItemText class="flex items-center w-full gap-2">
                <PencilIcon class="size-4" />
                <span>Rename</span>
                <span class="text-xs text-neutral-500 ml-auto">F2</span>
              </Menu.ItemText>
            </Menu.Item>
          {/if}
          {#if contextMenuFolders.length === 1 && contextMenuTags.length === 0}
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
          {/if}
          {#if contextMenuFolders.length === 0 && contextMenuTags.length === 1}
            <Menu.Separator />
            <Menu.Item value="copyPath">
              <Menu.ItemText class="flex items-center w-full gap-2">
                <Copy class="size-4" />
                <span>Copy Path</span>
                <span class="text-xs text-neutral-500 ml-auto">Ctrl+Q</span>
              </Menu.ItemText>
            </Menu.Item>
          {/if}
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

  {#if activeTag && selectedTags.length > 0}
    <TagEditorPopover
      tags={selectedTags}
      dataTypes={tagDataTypes}
      canUpdate={ability.can("update", "Tag")}
      canManage={ability.can("manage", "Tag")}
      bindingValue={selectedBindingValue}
      bindingMixed={selectedBindingMixed}
      bindingError={selectedBindingError}
      bindingState={selectedBindingState}
      hasOverride={hasSelectedOverride}
      propertyOverride={hasSelectedPropertyOverride}
      onPropertyOverrideClear={clearSelectedPropertyOverride}
      onSave={saveSelectedTags}
      onBindingSave={saveSelectedBinding}
      onBindingRemove={(key) => saveSelectedBinding(key, "")}
      onClearOverride={clearSelectedOverride}
      onPropertiesChange={updateSelectedTagProperties}
      propertyKeys={scriptPropertyKeys}
      {lockedPropertyKeys}
    />
  {/if}
</Popover>
