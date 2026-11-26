<script lang="ts">
  import { goto } from "$app/navigation";
  import { page as routePage } from "$app/state";
  import { untrack } from "svelte";
  import type { SvelteHTMLElements } from "svelte/elements";
  import {
    ArrowUpIcon,
    BlocksIcon,
    BoxIcon,
    CircleAlertIcon,
    ClipboardPasteIcon,
    CodeXmlIcon,
    CopyIcon,
    FilePlus2Icon,
    FileTextIcon,
    Link2Icon,
    MoreHorizontalIcon,
    PencilIcon,
    PlusIcon,
    Trash2Icon,
  } from "@lucide/svelte";
  import {
    Menu,
    Portal,
    TreeView,
    createTreeViewCollection,
    useTreeView,
  } from "@skeletonlabs/skeleton-svelte";
  import { getEditorContext } from "$lib/client/editor/editorContext";
  import { getScriptEvaluatorContext } from "$lib/client/editor/scriptEvaluatorContext";
  import { getAbilityContext } from "$lib/client/permissions/abilityContext";
  import { handleEditorKeyup, isEditableTarget } from "$lib/client/editor/editorKeyboard";
  import { getProjectElements } from "$lib/remote/editor.remote";
  import { undoManager } from "$lib/client/history/undoManager";
  import type { ElementRecord } from "$lib/elements/elementTypes";
  import {
    elementParentError,
    findContainerInsertionTarget,
    isContainerElement,
    sortedChildren,
  } from "$lib/elements/elementTypes";
  import type { PageRecord } from "$lib/elements/pageTypes";
  import type { ProjectSelect } from "$lib/sqlite/tables";
  import { commitOrRevert, focusOnMount } from "$lib/client/util/use";
  import { toast } from "$lib/client/toast.svelte";
  import { attempt } from "$lib/util/attempt";
  import {
    errorToString,
    neverThrowErrorToString,
    type NeverThrowError,
  } from "$lib/util/neverThrow";
  import { err, ok } from "neverthrow";
  import {
    collectElementSubtree,
    createElementCopy,
    createPageCopy,
    createProjectCopy,
    nextElementSortIndex,
    parseProjectClipboard,
    toClipboardElement,
    toClipboardPage,
    toClipboardProject,
    type ProjectClipboardItem,
    type ProjectClipboardItemInput,
  } from "$lib/client/editor/projectClipboard";
  import {
    getDropPosition,
    readTreeDragData,
    reorderIds,
    writeTreeDragData,
    type DropPosition,
    type TreeDragPayload,
  } from "$lib/client/util/dragging";

  const editor = getEditorContext();
  const ability = getAbilityContext();
  const editorEvaluator = getScriptEvaluatorContext();

  let renamingId = $state<string | null>(null);
  let contextMenuProjectId = $state<string | null>(null);
  let contextMenuPageId = $state<string | null>(null);
  let contextMenuElementId = $state<string | null>(null);
  let lastExpandedPageId: string | null = null;

  const contextMenuProject = $derived(
    contextMenuProjectId ? editor.projects.state[contextMenuProjectId] : undefined,
  );

  const contextMenuPage = $derived(
    contextMenuPageId ? editor.pagesCollection.state[contextMenuPageId] : undefined,
  );

  const contextMenuElement = $derived(
    contextMenuElementId ? editor.elementsCollection?.state[contextMenuElementId] : undefined,
  );

  type RootNode = {
    kind: "root";
    id: "root";
    name: string;
    parentId: null;
  };
  type ProjectNode = {
    kind: "project";
    id: string;
    name: string;
    parentId: null;
    project: ProjectSelect;
  };
  type PageTreeNode = {
    kind: "page";
    id: string;
    name: string;
    parentId: string | null;
    page: PageRecord;
  };
  type ElementNode = {
    kind: "element";
    id: string;
    name: string;
    parentId: string | null;
    pageId: string;
    element: ElementRecord;
  };
  type TreeNode = RootNode | ProjectNode | PageTreeNode | ElementNode;

  const rootNode: RootNode = {
    kind: "root",
    id: "root",
    name: "Pages",
    parentId: null,
  };

  function projectNode(project: ProjectSelect): ProjectNode {
    return {
      kind: "project",
      id: `${project.id}`,
      name: project.name,
      parentId: null,
      project,
    };
  }

  function pageNode(page: PageRecord): PageTreeNode {
    return {
      kind: "page",
      id: `${page.id}`,
      name: page.name,
      parentId: `${page.projectId}`,
      page,
    };
  }

  function elementNode(element: ElementRecord, pageId: string): ElementNode {
    return {
      kind: "element",
      id: `${element.id}`,
      name: element.name || element.tag || element.kind,
      parentId: element.parentId,
      pageId,
      element,
    };
  }

  function isProjectNode(node: TreeNode): node is ProjectNode {
    return node.kind === "project";
  }

  function childrenOf(node: TreeNode | undefined): TreeNode[] {
    if (!node) return [];

    if (node.kind === "root") {
      return editor.projectList.map(projectNode);
    }

    if (node.kind === "project") {
      return editor.children(node.project.id).map(pageNode);
    }

    if (node.kind === "page") {
      if (node.page.id !== editor.activePageId) return [];

      return sortedChildren(editor.elementsCollection?.state ?? {}, null).map((element) =>
        elementNode(element, node.page.id),
      );
    }

    if (node.kind === "element") {
      return sortedChildren(editor.elementsCollection?.state ?? {}, node.element.id).map(
        (element) => elementNode(element, node.pageId),
      );
    }

    return [];
  }

  let collection = $state(
    createTreeViewCollection<TreeNode>({
      nodeToValue: (node) => node.id,
      nodeToString: (node) => node.name,
      nodeToChildren: childrenOf,
      rootNode,
    }),
  );

  type PagesTreeApi = ReturnType<typeof useTreeView<TreeNode>>;

  let treeView: PagesTreeApi = useTreeView({
    id: "PAGES_TREE",
    collection,
    selectionMode: "multiple",
    expandOnClick: true,
    defaultExpandedValue: editor.projectList.map((project) => `${project.id}`),
    onSelectionChange: (details) => {
      const last = details.selectedNodes.at(-1);
      if (!last) {
        editor.clearElementSelection();
        editor.clearProjectSelection();
        return;
      }

      if (last.kind === "project") {
        editor.selectProject(last.project.id);
        return;
      }

      if (last.kind !== "element") {
        editor.clearProjectSelection();
        editor.clearElementSelection();
        if (last.kind === "page" && last.page.id !== editor.activePageId) {
          void open(last.page.id);
        }
        return;
      }

      editor.clearProjectSelection();
      const selectedElements = details.selectedNodes.filter(
        (node): node is ElementNode => node.kind === "element",
      );

      editor.setElementSelection(
        selectedElements.map((node) => node.element.id),
        last.element.id,
      );
      for (const node of selectedElements) expandParents(node);
    },
  });

  const treeSelection = $derived(
    editor.selectedProjectId
      ? [String(editor.selectedProjectId)]
      : editor.selectedElementIds.length > 0
        ? editor.selectedElementIds.map(String)
        : editor.activePageId
          ? [String(editor.activePageId)]
          : [],
  );

  $effect(() => {
    const activeId = editor.activePageId;
    if (!activeId || activeId === lastExpandedPageId) return;
    const active = editor.pagesCollection.state[activeId];
    if (!active) return;

    untrack(() => {
      const expanded = new Set(treeView().expandedValue);
      expanded.add(`${active.projectId}`);
      expanded.add(`${active.id}`);

      const currentExpanded = treeView().expandedValue;
      if ([...expanded].every((id) => currentExpanded.includes(id))) return;
      treeView().setExpandedValue([...expanded]);
    });
    lastExpandedPageId = activeId;
  });

  $effect(() => {
    const value = treeSelection;
    untrack(() => {
      const current = treeView().selectedValue;
      if (
        current.length === value.length &&
        current.every((item, index) => item === value[index])
      ) {
        return;
      }
      treeView().setSelectedValue(value);
    });
  });

  let dragging = $state<TreeDragPayload | null>(null);
  let dropTarget = $state<{ id: string; position: DropPosition } | null>(null);

  function clearDrag() {
    dragging = null;
    dropTarget = null;
  }

  function handleDragStart(ev: DragEvent, node: TreeNode) {
    const payload: TreeDragPayload | null =
      node.kind === "page"
        ? { kind: "page", id: node.page.id }
        : node.kind === "element"
          ? { kind: "element", id: node.element.id }
          : null;
    if (!payload) return;

    ev.stopPropagation();
    dragging = payload;
    writeTreeDragData(ev, payload);
  }

  function resolveDrop(
    event: DragEvent,
    node: TreeNode,
    payload: TreeDragPayload,
  ): { position: DropPosition } | null {
    const target = event.currentTarget;
    if (!(target instanceof Element)) return null;

    const pages = editor.pagesCollection.state;
    const elements = editor.elementsCollection?.state ?? {};

    if (payload.kind === "page") {
      if (node.kind === "project") {
        const page = pages[payload.id];
        return page?.projectId === node.project.id ? { position: "inside" } : null;
      }
      if (node.kind === "page") {
        if (payload.id === node.page.id) return null;
        const page = pages[payload.id];
        if (!page || page.projectId !== node.page.projectId) return null;
        return { position: getDropPosition(event, target, false) };
      }
      return null;
    }

    if (payload.kind === "element") {
      const dragged = elements[payload.id];
      if (!dragged) return null;

      if (node.kind === "page") {
        return node.page.id === editor.activePageId ? { position: "inside" } : null;
      }

      if (node.kind !== "element") return null;
      const targetElement = node.element;
      if (dragged.id === targetElement.id) return null;
      if (isElementDescendant(targetElement.id, dragged.id)) return null;

      const allowInside = isContainerElement(targetElement);
      const position = getDropPosition(event, target, allowInside);
      const parent = targetElement.parentId ? (elements[targetElement.parentId] ?? null) : null;
      const parentError =
        position === "inside"
          ? elementParentError(dragged, targetElement)
          : elementParentError(dragged, parent);
      return parentError ? null : { position };
    }

    return null;
  }

  function isElementDescendant(candidateId: string, ancestorId: string) {
    const elements = editor.elementsCollection?.state ?? {};
    let current: ElementRecord | undefined = elements[candidateId];
    while (current) {
      if (current.parentId === ancestorId) return true;
      current = current.parentId ? elements[current.parentId] : undefined;
    }
    return false;
  }

  function handleDragOver(ev: DragEvent, node: TreeNode) {
    if (!dragging) return;
    const drop = resolveDrop(ev, node, dragging);
    if (!drop) {
      if (dropTarget?.id === node.id) dropTarget = null;
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = "none";
      return;
    }

    ev.preventDefault();
    ev.stopPropagation();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
    if (dropTarget?.id !== node.id || dropTarget.position !== drop.position) {
      dropTarget = { id: node.id, position: drop.position };
    }
  }

  function handleDragLeave(ev: DragEvent, node: TreeNode) {
    const current = ev.currentTarget;
    if (
      current instanceof Node &&
      ev.relatedTarget instanceof Node &&
      current.contains(ev.relatedTarget)
    ) {
      return;
    }
    if (dropTarget?.id === node.id) dropTarget = null;
  }

  function handleDropOnNode(ev: DragEvent, node: TreeNode) {
    const payload = dragging ?? readTreeDragData(ev);
    if (!payload) {
      clearDrag();
      return;
    }
    const drop = resolveDrop(ev, node, payload);
    if (!drop) {
      clearDrag();
      return;
    }

    ev.preventDefault();
    ev.stopPropagation();
    if (payload.kind === "page") applyPageDrop(payload.id, node, drop.position);
    else if (payload.kind === "element") applyElementDrop(payload.id, node, drop.position);
    clearDrag();
  }

  function updatePageOrder(pages: PageRecord[]) {
    const now = Date.now();
    editor.pagesCollection.updateMany(
      pages.map((page, index) => ({
        id: page.id,
        changes: { sortIndex: index, updatedAt: now },
      })),
    );
  }

  function applyPageDrop(pageId: string, node: TreeNode, position: DropPosition) {
    const dragged = editor.pagesCollection.state[pageId];
    if (!dragged) return;

    if (node.kind === "project") {
      if (dragged.projectId !== node.project.id) return;
      const pages = editor.children(node.project.id).filter((page) => page.id !== pageId);
      updatePageOrder([...pages, dragged]);
      return;
    }

    if (node.kind === "page" && dragged.projectId === node.page.projectId) {
      const siblings = editor.children(node.page.projectId);
      const byId = new Map(siblings.map((page) => [page.id, page]));
      const ids = reorderIds(
        siblings.map((page) => page.id),
        pageId,
        node.page.id,
        position,
      );
      updatePageOrder(ids.map((id) => byId.get(id)).filter((page): page is PageRecord => !!page));
    }
  }

  function applyElementDrop(elementId: string, node: TreeNode, position: DropPosition) {
    const elements = editor.elementsCollection?.state ?? {};
    const dragged = elements[elementId];
    if (!dragged) return;

    if (node.kind === "page" && node.page.id === editor.activePageId) {
      moveElement(elementId, null);
      return;
    }

    if (node.kind !== "element") return;
    const target = node.element;

    if (position === "inside") {
      moveElement(elementId, target.id);
      return;
    }

    moveElement(elementId, target.parentId, target.id, position);
  }

  function moveElement(
    elementId: string,
    newParentId: string | null,
    targetId?: string,
    position: DropPosition = "inside",
  ) {
    const collection = editor.elementsCollection;
    const elements = collection?.state ?? {};
    const dragged = elements[elementId];
    if (!collection || !dragged) return;

    const newParent = newParentId ? (elements[newParentId] ?? null) : null;
    if (newParentId && !newParent) return;
    if (elementParentError(dragged, newParent)) return;

    const now = Date.now();
    const changes = new Map<string, Partial<ElementRecord>>();
    const oldParentId = dragged.parentId;
    const newSiblings = sortedChildren(elements, newParentId).filter(
      (element) => element.id !== elementId,
    );
    const orderedIds =
      targetId === undefined
        ? [...newSiblings.map((element) => element.id), elementId]
        : reorderIds(
            newSiblings.map((element) => element.id),
            elementId,
            targetId,
            position,
          );

    orderedIds.forEach((id, index) => {
      changes.set(id, {
        ...(changes.get(id) ?? {}),
        sortIndex: index,
        updatedAt: now,
      });
    });
    changes.set(elementId, {
      ...(changes.get(elementId) ?? {}),
      parentId: newParentId,
      sortIndex: orderedIds.indexOf(elementId),
      updatedAt: now,
    });

    if (oldParentId !== newParentId) {
      sortedChildren(elements, oldParentId)
        .filter((element) => element.id !== elementId)
        .forEach((element, index) => {
          changes.set(element.id, {
            ...(changes.get(element.id) ?? {}),
            sortIndex: index,
            updatedAt: now,
          });
        });
    }

    collection.updateMany(
      [...changes].map(([id, elementChanges]) => ({ id, changes: elementChanges })),
    );
  }

  /**
   * expand all parent elements in the tree and the page itself
   * @param node tree node to expand all parents of including the page it's on
   */
  function expandParents(node: TreeNode) {
    const expanded = treeView().expandedValue;
    if (node.parentId) {
      expanded.push(node.parentId);
      const parentNode = treeView().collection.findNode(node.parentId);
      expandParents(parentNode);
    } else if ("pageId" in node) {
      expanded.push(node.pageId);
    }
    treeView().setExpandedValue(expanded);
  }

  async function open(id: string) {
    const result = await editor.openPage(id);
    if (result.isErr()) {
      toast({
        kind: "error",
        title: "Open Page Error",
        description: neverThrowErrorToString(result.error),
        duration: 3000,
      });
      return err(result.error);
    }
    if (routePage.url.pathname !== "/editor") {
      await goto("/editor", { keepFocus: true });
    }
    return ok(null);
  }

  async function addPage(projectId: string) {
    const id = editor.addPage(projectId);
    await open(id);
    renamingId = id;
  }

  function removePage(id: string) {
    editor.deletePage(id);
    contextMenuPageId = null;
  }

  type ClipboardTarget =
    | { kind: "element"; pageId: string; parentId: string | null }
    | { kind: "page"; projectId: string; pageId: string }
    | { kind: "project"; projectId: string };

  function selectedTreeNodes() {
    const nodes: TreeNode[] = [];
    for (const id of treeView().selectedValue) {
      const node = treeView().collection.findNode(id);
      if (node) nodes.push(node);
    }
    return nodes;
  }

  function primarySelectedNode() {
    return selectedTreeNodes().at(-1) ?? null;
  }

  function contextTreeNode() {
    if (contextMenuElement && editor.activePageId) {
      return elementNode(contextMenuElement, editor.activePageId);
    }
    if (contextMenuPage) return pageNode(contextMenuPage);
    if (contextMenuProject) return projectNode(contextMenuProject);
    return undefined;
  }

  function isCoveredBySelection(node: TreeNode, selected: TreeNode[]) {
    if (node.kind === "root") return true;
    for (const other of selected) {
      if (other.id === node.id) continue;
      if (other.kind === "project") {
        if (node.kind === "page" && node.page.projectId === other.project.id) return true;
        if (
          node.kind === "element" &&
          editor.pagesCollection.state[node.pageId]?.projectId === other.project.id
        ) {
          return true;
        }
      }
      if (other.kind === "page" && node.kind === "element" && node.pageId === other.page.id) {
        return true;
      }
      if (
        other.kind === "element" &&
        node.kind === "element" &&
        isElementDescendant(node.element.id, other.element.id)
      ) {
        return true;
      }
    }
    return false;
  }

  function sortedElementValues(elements: Record<string, ElementRecord>) {
    return Object.values(elements).sort(
      (a, b) =>
        a.sortIndex - b.sortIndex || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
    );
  }

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

  async function projectElementsForCopy(projectId: string) {
    if (editor.activeProjectId === projectId) {
      const elementsByPage: Record<string, Record<string, ElementRecord>> = {};
      for (const page of editor.children(projectId)) {
        elementsByPage[page.id] = editor.getPageElementsSnapshot(page.id) ?? {};
      }
      return ok(elementsByPage);
    }

    const loaded = await attempt(() => getProjectElements(projectId));
    if (loaded.isErr) {
      return err({
        reason: "COPY_ELEMENTS_FAILED",
        cause: errorToString(loaded.error),
      } as const satisfies NeverThrowError);
    }
    if (loaded.data.isErr) return err(loaded.data.error);
    return ok(loaded.data.value);
  }

  async function buildClipboardItems(nodes: TreeNode[]) {
    const items: ProjectClipboardItemInput[] = [];
    const cache = new Map<string, Record<string, Record<string, ElementRecord>>>();

    async function loadProjectElements(projectId: string) {
      const cached = cache.get(projectId);
      if (cached) return ok(cached);

      const result = await projectElementsForCopy(projectId);
      if (result.isErr()) return err(result.error);
      cache.set(projectId, result.value);
      return ok(result.value);
    }

    for (const node of nodes) {
      if (node.kind === "project") {
        const elements = await loadProjectElements(node.project.id);
        if (elements.isErr()) return err(elements.error);

        items.push({
          type: "project",
          project: toClipboardProject(node.project),
          pages: editor.children(node.project.id).map((page) => ({
            page: toClipboardPage(page),
            elements: sortedElementValues(elements.value[page.id] ?? {}).map(toClipboardElement),
          })),
        });
        continue;
      }

      if (node.kind === "page") {
        const elements = await loadProjectElements(node.page.projectId);
        if (elements.isErr()) return err(elements.error);

        items.push({
          type: "page",
          page: toClipboardPage(node.page),
          elements: sortedElementValues(elements.value[node.page.id] ?? {}).map(toClipboardElement),
        });
        continue;
      }

      if (node.kind === "element") {
        const subtree = collectElementSubtree(
          editor.elementsCollection?.state ?? {},
          node.element.id,
        );
        if (subtree.length === 0) continue;

        items.push({
          type: "element",
          rootId: node.element.id,
          elements: subtree.map(toClipboardElement),
        });
      }
    }

    return ok(items);
  }

  async function copyNodes(nodes: TreeNode[]) {
    const roots = nodes.filter(
      (node) => node.kind !== "root" && !isCoveredBySelection(node, nodes),
    );
    if (roots.length === 0) return;

    const built = await buildClipboardItems(roots);
    if (built.isErr()) {
      console.error(`copyNodes() ${neverThrowErrorToString(built.error)}`);
      return;
    }

    const copied = await copyToClipboard(JSON.stringify(built.value));
    if (copied.isErr()) {
      console.error(`copyNodes() ${neverThrowErrorToString(copied.error)}`);
    }
  }

  function resolvePasteTarget(node: TreeNode | null | undefined) {
    if (!node || node.kind === "root") {
      return err({
        reason: "PASTE_NO_TARGET",
        cause: "Select an element, page, or project to paste into",
      } as const satisfies NeverThrowError);
    }

    if (node.kind === "element") {
      const parentId = findContainerInsertionTarget(
        editor.elementsCollection?.state ?? {},
        node.element.id,
      );
      if (!parentId) {
        return err({
          reason: "PASTE_INVALID_TARGET",
          cause: "No viable container found for paste",
        } as const satisfies NeverThrowError);
      }
      return ok({
        kind: "element",
        pageId: node.pageId,
        parentId,
      } as const);
    }

    if (node.kind === "page") {
      return ok({
        kind: "page",
        projectId: node.page.projectId,
        pageId: node.page.id,
      } as const);
    }

    return ok({ kind: "project", projectId: node.project.id } as const);
  }

  function projectIdForTarget(target: ClipboardTarget) {
    if (target.kind === "project") return target.projectId;
    if (target.kind === "page") return target.projectId;
    return editor.pagesCollection.state[target.pageId]?.projectId ?? null;
  }

  function validatePasteSupport(items: ProjectClipboardItem[], target: ClipboardTarget) {
    if (items.some((item) => item.type === "element") && target.kind === "project") {
      return err({
        reason: "PASTE_INVALID_TARGET",
        cause: "Paste elements onto a page or a container element",
      } as const satisfies NeverThrowError);
    }
    if (items.some((item) => item.type === "page") && !projectIdForTarget(target)) {
      return err({
        reason: "PASTE_INVALID_TARGET",
        cause: "Could not resolve a target project for the pasted page",
      } as const satisfies NeverThrowError);
    }
    return ok(null);
  }

  async function ensureProjectOpen(projectId: string) {
    const opened = await editor.openProject(projectId);
    if (opened.isErr()) {
      toast({
        kind: "error",
        title: "Open Project Error",
        description: neverThrowErrorToString(opened.error),
        duration: 3000,
      });
      return err(opened.error);
    }
    return ok(null);
  }

  async function pasteElementItem(item: ProjectClipboardItem, target: ClipboardTarget) {
    if (item.type !== "element") {
      return err({
        reason: "PASTE_INVALID_ITEM",
        cause: "Expected an element clipboard item",
      } as const satisfies NeverThrowError);
    }
    if (target.kind === "project") {
      return err({
        reason: "PASTE_INVALID_TARGET",
        cause: "Elements can only be pasted onto a page or container element",
      } as const satisfies NeverThrowError);
    }

    const parentId = target.kind === "element" ? target.parentId : null;
    const opened = await open(target.pageId);
    if (opened.isErr()) return err(opened.error);

    const elements = createElementCopy(
      item,
      parentId,
      nextElementSortIndex(editor.getPageElementsSnapshot(target.pageId), parentId),
    );
    const root = elements.find((element) => element.parentId === parentId);
    const parent = parentId ? (editor.elementsCollection?.state[parentId] ?? null) : null;
    const parentError = root ? elementParentError(root, parent) : null;
    if (parentError) {
      return err({
        reason: "PASTE_INVALID_TARGET",
        cause: parentError,
      } as const satisfies NeverThrowError);
    }

    const added = editor.addElementsToPage(target.pageId, elements);
    if (added.isErr()) return err(added.error);
    return ok(elements.map((element) => element.id));
  }

  async function pastePageItem(item: ProjectClipboardItem, targetProjectId: string) {
    if (item.type !== "page") {
      return err({
        reason: "PASTE_INVALID_ITEM",
        cause: "Expected a page clipboard item",
      } as const satisfies NeverThrowError);
    }

    const opened = await ensureProjectOpen(targetProjectId);
    if (opened.isErr()) return err(opened.error);

    const copied = createPageCopy(item, targetProjectId, editor.children(targetProjectId));
    editor.pagesCollection.add(copied.page);
    const added = editor.addElementsToPage(copied.page.id, copied.elements);
    if (added.isErr()) {
      editor.deletePage(copied.page.id);
      return err(added.error);
    }
    return ok(copied.page.id);
  }

  async function pasteProjectItem(item: ProjectClipboardItem) {
    if (item.type !== "project") {
      return err({
        reason: "PASTE_INVALID_ITEM",
        cause: "Expected a project clipboard item",
      } as const satisfies NeverThrowError);
    }

    const copied = createProjectCopy(item, editor.projectList);
    editor.projects.add(copied.project);
    editor.pagesCollection.addMany(copied.pages.map((page) => page.page));

    const opened = await editor.openProject(copied.project.id);
    if (opened.isErr()) {
      editor.pagesCollection.removeMany(copied.pages.map((page) => page.page.id));
      editor.projects.remove(copied.project.id);
      return err(opened.error);
    }

    for (const page of copied.pages) {
      const added = editor.addElementsToPage(page.page.id, page.elements);
      if (added.isErr()) {
        editor.removeProject(copied.project.id);
        editor.pagesCollection.removeMany(copied.pages.map((entry) => entry.page.id));
        return err(added.error);
      }
    }

    return ok(copied.project.id);
  }

  async function pasteClipboardText(text: string, node: TreeNode | null | undefined) {
    const parsed = parseProjectClipboard(text);
    if (parsed.isErr()) {
      console.error(`pasteClipboardText() ${neverThrowErrorToString(parsed.error)}`);
      toast({
        kind: "error",
        title: "Paste Error",
        description: neverThrowErrorToString(parsed.error),
        duration: 3000,
      });
      return err(parsed.error);
    }

    const targetResult = resolvePasteTarget(node);
    if (targetResult.isErr()) {
      console.error(`pasteClipboardText() ${neverThrowErrorToString(targetResult.error)}`);
      toast({
        kind: "error",
        title: "Paste Error",
        description: neverThrowErrorToString(targetResult.error),
        duration: 3000,
      });
      return err(targetResult.error);
    }
    const target = targetResult.value;

    const supported = validatePasteSupport(parsed.value, target);
    if (supported.isErr()) {
      console.error(`pasteClipboardText() ${neverThrowErrorToString(supported.error)}`);
      toast({
        kind: "error",
        title: "Paste Error",
        description: neverThrowErrorToString(supported.error),
        duration: 3000,
      });
      return err(supported.error);
    }

    type PasteSelection =
      | { kind: "element" }
      | { kind: "page"; pageId: string }
      | { kind: "project"; projectId: string };

    const pastedElementIds: string[] = [];
    undoManager.beginTransaction();
    let selection: PasteSelection | null = null;
    try {
      const targetProjectId = projectIdForTarget(target);

      for (const item of parsed.value) {
        if (item.type === "element") {
          const pasted = await pasteElementItem(item, target);
          if (pasted.isErr()) return err(pasted.error);
          pastedElementIds.push(...pasted.value);
          selection = { kind: "element" };
        } else if (item.type === "page") {
          if (!targetProjectId) {
            return err({
              reason: "PASTE_INVALID_TARGET",
              cause: "Could not resolve a target project for the pasted page",
            } as const satisfies NeverThrowError);
          }
          const pasted = await pastePageItem(item, targetProjectId);
          if (pasted.isErr()) return err(pasted.error);
          selection = { kind: "page", pageId: pasted.value };
        } else {
          const pasted = await pasteProjectItem(item);
          if (pasted.isErr()) return err(pasted.error);
          selection = { kind: "project", projectId: pasted.value };
        }
      }

      if (selection?.kind === "element") {
        editor.setElementSelection(pastedElementIds);
      } else if (selection?.kind === "page") {
        const opened = await open(selection.pageId);
        if (opened.isErr()) return err(opened.error);
      } else if (selection?.kind === "project") {
        editor.selectProject(selection.projectId);
      }
      return ok(null);
    } finally {
      undoManager.endTransaction();
    }
  }

  async function handleTreePaste(event: ClipboardEvent) {
    if (isEditableTarget(event.target)) return;

    const text = event.clipboardData?.getData("text/plain");
    event.preventDefault();
    event.stopPropagation();
    if (!text) return;

    const result = await pasteClipboardText(text, primarySelectedNode());
    if (result.isErr()) {
      console.error(`handleTreePaste() ${neverThrowErrorToString(result.error)}`);
    }
  }

  function handleTreeContextMenu(event: MouseEvent) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const elementRow = target.closest<HTMLElement>("[data-element-id]");
    const elementId = elementRow?.dataset.elementId;

    const pageRow = target.closest<HTMLElement>("[data-page-id]");
    const pageId = pageRow?.dataset.pageId;

    const projectRow = target.closest<HTMLElement>("[data-project-id]");
    const projectId = projectRow?.dataset.projectId;

    if (elementId) {
      contextMenuElementId = elementId;
      if (!editor.isElementSelected(elementId)) editor.setElementSelection([elementId], elementId);
      contextMenuPageId = null;
      contextMenuProjectId = null;
      return;
    }
    if (pageId) {
      contextMenuPageId = pageId;
      contextMenuElementId = null;
      contextMenuProjectId = null;
      editor.clearElementSelection();
      return;
    }
    if (projectId) {
      contextMenuProjectId = projectId;
      contextMenuElementId = null;
      contextMenuPageId = null;
      editor.selectProject(projectId);
    }
  }

  function formatRename(name: string) {
    const value = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-");
    renamingId = null;
    return value;
  }

  async function handleMenuSelect(value: string) {
    const target = contextTreeNode();

    if (value === "copy") {
      const selected = selectedTreeNodes();
      const nodes =
        target && selected.some((node) => node.id === target.id)
          ? selected
          : target
            ? [target]
            : selected;
      await copyNodes(nodes);
      return;
    }

    if (value === "paste") {
      const text = await readClipboard();
      if (text.isErr()) {
        console.error(`handleMenuSelect() ${neverThrowErrorToString(text.error)}`);
        return;
      }
      if (!text.value) return;

      const result = await pasteClipboardText(text.value, target ?? primarySelectedNode());
      if (result.isErr()) {
        console.error(`handleMenuSelect() ${neverThrowErrorToString(result.error)}`);
      }
      return;
    }

    if (contextMenuProject) {
      if (value === "delete") {
        if (confirm(`Delete project "${contextMenuProject.name}" and all its pages?`)) {
          editor.removeProject(contextMenuProject.id);
        }
      }
      contextMenuProjectId = null;
      return;
    }

    if (contextMenuElement) {
      switch (value) {
        case "add":
          alert("not implimented");
          break;
        case "rename":
          renamingId = contextMenuElement.id;
          break;
        case "delete":
          if (editor.isElementSelected(contextMenuElement.id)) editor.removeSelectedElements();
          else editor.removeElement(contextMenuElement.id);
          break;
      }
    }

    if (contextMenuPage) {
      switch (value) {
        case "rename":
          renamingId = contextMenuPage.id;
          break;
        case "delete":
          removePage(contextMenuPage.id);
          break;
      }
    }
  }

  async function handleTreeKeyup(ev: KeyboardEvent) {
    if (isEditableTarget(ev.target)) return;

    if (ev.key.toLowerCase() === "c" && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      await copyNodes(selectedTreeNodes());
      return;
    }

    if (ev.key === "F2") {
      renamingId = editor.primarySelectedElementId ?? editor.activePageId;
    }
  }
</script>

{#snippet projectLabel(project: ProjectSelect)}
  <div class="flex grow gap-2 min-w-0">
    <BlocksIcon class="size-4 shrink-0 opacity-60" />
    <span class="font-semibold truncate">{project.name}</span>
    <span class="opacity-50 truncate">/{project.name}</span>
  </div>
{/snippet}

{#snippet pageLabel(page: PageRecord)}
  <div class="flex grow gap-2 min-w-0">
    <FileTextIcon class="size-4 shrink-0 opacity-60" />
    {#if renamingId === page.id}
      <input
        class="input p-0 text-xs grow"
        value={page.name}
        use:focusOnMount
        onclick={(ev) => ev.stopPropagation()}
        {@attach commitOrRevert(
          (value) => editor.renamePage(page.id, formatRename(value)),
          "string",
          () => {
            renamingId = null;
          },
          { commitOnUnchanged: true },
        )}
      />
    {:else}
      <span class="truncate">{page.name}</span>
      <span class="truncate opacity-50 ml-auto">
        {editor.route(page.id)}
      </span>
    {/if}
  </div>
{/snippet}

{#snippet elementLabel(element: ElementRecord)}
  {@const bindingError = editorEvaluator.elementError(element)}
  <div class="flex grow gap-2 min-w-0">
    <CodeXmlIcon class="size-4 shrink-0 opacity-60" />
    {#if renamingId === element.id}
      <input
        class="input p-0 text-xs grow"
        value={element.name}
        use:focusOnMount
        onclick={(ev) => ev.stopPropagation()}
        {@attach commitOrRevert(
          (value) => editor.elementsCollection?.update(element.id, { name: formatRename(value) }),
          "string",
          () => {
            renamingId = null;
          },
          { commitOnUnchanged: true },
        )}
      />
    {:else}
      <span class="truncate">{element.name}</span>
      <span class="truncate opacity-50">{element.tag}</span>
      <div class="flex gap-2 shrink ml-auto items-center min-w-0">
        {#if element.bindings}
          <Link2Icon class="size-5 opacity-85" title="bindings" />
        {/if}
        <CircleAlertIcon
          class={bindingError
            ? "size-4 shrink-0 text-error-600-400 opacity-100"
            : "size-4 shrink-0 text-error-600-400 opacity-0"}
          aria-hidden={!bindingError}
          title={bindingError
            ? `${bindingError.scope}${bindingError.key ? `.${bindingError.key}` : ""}: ${bindingError.message}`
            : undefined}
        />
        <span class="truncate opacity-50">{element.kind}</span>
      </div>
    {/if}
  </div>
{/snippet}

{#snippet treeNode(node: TreeNode, indexPath: number[])}
  {@const children = childrenOf(node)}
  <TreeView.NodeProvider value={{ node, indexPath }}>
    {#if node.kind === "project"}
      <TreeView.Branch>
        <TreeView.BranchControl
          data-project-id={node.project.id}
          data-drop={dropTarget?.id === node.id ? dropTarget.position : undefined}
          ondragover={(ev) => handleDragOver(ev, node)}
          ondragleave={(ev) => handleDragLeave(ev, node)}
          ondrop={(ev) => handleDropOnNode(ev, node)}
        >
          <TreeView.BranchIndicator />
          <div class="flex items-center justify-between grow">
            <TreeView.BranchText>
              {@render projectLabel(node.project)}
            </TreeView.BranchText>
            <button
              class="p-2 rounded-full hover:bg-surface-300-700"
              title="New root page"
              onclick={(event) => {
                event.stopPropagation();
                void addPage(node.project.id);
              }}
            >
              <FilePlus2Icon class="size-4" />
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
    {:else if node.kind === "page"}
      {#if children.length > 0}
        <TreeView.Branch>
          <TreeView.BranchControl
            data-page-id={node.page.id}
            data-drop={dropTarget?.id === node.id ? dropTarget.position : undefined}
            draggable="true"
            ondragstart={(ev) => handleDragStart(ev, node)}
            ondragend={clearDrag}
            ondragover={(ev) => handleDragOver(ev, node)}
            ondragleave={(ev) => handleDragLeave(ev, node)}
            ondrop={(ev) => handleDropOnNode(ev, node)}
          >
            <TreeView.BranchIndicator />
            <TreeView.BranchText class="w-full ">
              {@render pageLabel(node.page)}
            </TreeView.BranchText>
          </TreeView.BranchControl>
          <TreeView.BranchContent>
            <TreeView.BranchIndentGuide />
            {#each children as child, index (child.id)}
              {@render treeNode(child, [...indexPath, index])}
            {/each}
          </TreeView.BranchContent>
        </TreeView.Branch>
      {:else}
        <TreeView.Item
          data-page-id={node.page.id}
          data-drop={dropTarget?.id === node.id ? dropTarget.position : undefined}
          draggable="true"
          ondragstart={(ev) => handleDragStart(ev, node)}
          ondragend={clearDrag}
          ondragover={(ev) => handleDragOver(ev, node)}
          ondragleave={(ev) => handleDragLeave(ev, node)}
          ondrop={(ev) => handleDropOnNode(ev, node)}
        >
          {@render pageLabel(node.page)}
        </TreeView.Item>
      {/if}
    {:else if node.kind === "element"}
      {#if children.length > 0}
        <TreeView.Branch>
          <TreeView.BranchControl
            data-element-id={node.element.id}
            data-drop={dropTarget?.id === node.id ? dropTarget.position : undefined}
            draggable="true"
            ondragstart={(ev) => handleDragStart(ev, node)}
            ondragend={clearDrag}
            ondragover={(ev) => handleDragOver(ev, node)}
            ondragleave={(ev) => handleDragLeave(ev, node)}
            ondrop={(ev) => handleDropOnNode(ev, node)}
          >
            <TreeView.BranchIndicator />
            <TreeView.BranchText class="w-full">
              {@render elementLabel(node.element)}
            </TreeView.BranchText>
          </TreeView.BranchControl>
          <TreeView.BranchContent>
            <TreeView.BranchIndentGuide />
            {#each children as child, index (child.id)}
              {@render treeNode(child, [...indexPath, index])}
            {/each}
          </TreeView.BranchContent>
        </TreeView.Branch>
      {:else}
        <TreeView.Item
          data-element-id={node.element.id}
          data-drop={dropTarget?.id === node.id ? dropTarget.position : undefined}
          draggable="true"
          ondragstart={(ev) => handleDragStart(ev, node)}
          ondragend={clearDrag}
          ondragover={(ev) => handleDragOver(ev, node)}
          ondragleave={(ev) => handleDragLeave(ev, node)}
          ondrop={(ev) => handleDropOnNode(ev, node)}
        >
          {@render elementLabel(node.element)}
        </TreeView.Item>
      {/if}
    {/if}
  </TreeView.NodeProvider>
{/snippet}

<div class="flex flex-col h-full min-h-0 text-xs">
  <div class="flex items-center justify-between border-b border-surface-200-800 p-2">
    <span class="font-semibold">Projects</span>
    <button
      type="button"
      class="btn-icon btn-sm"
      title="New project"
      aria-label="New project"
      disabled={!ability.can("update", "Project")}
      onclick={() => editor.addProject()}
    >
      <PlusIcon class="size-4" />
    </button>
  </div>
  <fieldset class="contents" disabled={!ability.can("update", "Page")}>
    {#if editor.projectList.length === 0}
      <p class="p-3 opacity-60">
        No projects exist yet. Insert a project row in the database to start creating pages.
      </p>
    {/if}
    <Menu onSelect={(details) => void handleMenuSelect(details.value)}>
      <Menu.ContextTrigger class="flex flex-1 overflow-y-auto ">
        <TreeView.Provider value={treeView}>
          <TreeView.Tree
            class="w-full"
            oncontextmenu={handleTreeContextMenu}
            onpaste={(event) => void handleTreePaste(event)}
            onkeyup={(ev) => {
              void handleTreeKeyup(ev);
              handleEditorKeyup(editor, ev);
            }}
          >
            {#each childrenOf(rootNode) as node, index (node.id)}
              {@render treeNode(node, [index])}
            {/each}
          </TreeView.Tree>
        </TreeView.Provider>
      </Menu.ContextTrigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content class="text-xs border-none bg-surface-100-900">
            <Menu.Item value="copy">
              <Menu.ItemText class="flex items-center w-full gap-2">
                <CopyIcon class="size-4" />
                <span>Copy</span>
                <span class="text-xs text-neutral-500 ml-auto">Ctrl+C</span>
              </Menu.ItemText>
            </Menu.Item>
            <Menu.Item value="paste">
              <Menu.ItemText class="flex items-center w-full gap-2">
                <ClipboardPasteIcon class="size-4" />
                <span>Paste</span>
                <span class="text-xs text-neutral-500 ml-auto">Ctrl+V</span>
              </Menu.ItemText>
            </Menu.Item>
            <Menu.Separator />
            {#if contextMenuProject}
              <Menu.Item value="delete" class="text-error-600-400">
                <Menu.ItemText class="flex items-center w-full gap-2">
                  <Trash2Icon class="size-4" />
                  <span>Delete project</span>
                </Menu.ItemText>
              </Menu.Item>
            {:else}
              {#if contextMenuElement}
                <Menu.Item value="add">
                  <Menu.ItemText class="flex items-center w-full gap-2">
                    <ArrowUpIcon class="size-4" />
                    <span>Add</span>
                    <span class="text-xs text-neutral-500 ml-auto">Ins</span>
                  </Menu.ItemText>
                </Menu.Item>
              {/if}
              <Menu.Item value="rename">
                <Menu.ItemText class="flex items-center w-full gap-2">
                  <PencilIcon class="size-4" />
                  <span>Rename</span>
                  <span class="text-xs text-neutral-500 ml-auto">F2</span>
                </Menu.ItemText>
              </Menu.Item>
              <Menu.Item value="delete" class="text-error-600-400">
                <Menu.ItemText class="flex items-center w-full gap-2">
                  <Trash2Icon class="size-4" />
                  <span>Delete</span>
                  <span class="text-xs text-neutral-500 ml-auto">Del</span>
                </Menu.ItemText>
              </Menu.Item>
            {/if}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu>
  </fieldset>
</div>

<style>
  :global([data-drop="before"]) {
    border-top: 0.2rem solid var(--color-primary-500);
    border-top-left-radius: 0;
    border-top-right-radius: 0;
  }

  :global([data-drop="after"]) {
    border-bottom: 0.2rem solid var(--color-primary-500);
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }

  :global([data-drop="inside"]) {
    outline: 2px solid var(--color-primary-500);
    outline-offset: -2px;
  }
</style>
