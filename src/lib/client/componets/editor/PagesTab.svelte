<script lang="ts">
  import { goto } from "$app/navigation";
  import { page as routePage } from "$app/state";
  import { untrack } from "svelte";
  import type { SvelteHTMLElements } from "svelte/elements";
  import {
    ArrowUpIcon,
    BlocksIcon,
    BoxIcon,
    FilePlus2Icon,
    FileTextIcon,
    Link2Icon,
    MoreHorizontalIcon,
    PencilIcon,
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
  import { getAbilityContext } from "$lib/client/permissions/abilityContext";
  import { handleEditorKeyup } from "$lib/client/editor/editorKeyboard";
  import type { ElementRecord } from "$lib/elements/elementTypes";
  import {
    elementParentError,
    isContainerElement,
    sortedChildren,
  } from "$lib/elements/elementTypes";
  import type { PageRecord } from "$lib/elements/pageTypes";
  import { focusOnMount } from "$lib/client/util/use";
  import { toast } from "$lib/client/toast.svelte";
  import { neverThrowErrorToString } from "$lib/util/neverThrow";
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
  type ProjectSelect = (typeof editor.projects)[number];

  let renamingId = $state<string | null>(null);
  let contextMenuPageId = $state<string | null>(null);
  let contextMenuElementId = $state<string | null>(null);
  let lastExpandedPageId: string | null = null;

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
      return editor.projects.map(projectNode);
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
    defaultExpandedValue: editor.projects.map((project) => `${project.id}`),
    onSelectionChange: (details) => {
      const last = details.selectedNodes.at(-1);
      if (!last) {
        editor.clearElementSelection();
        return;
      }

      if (last.kind !== "element") {
        editor.clearElementSelection();
        if (last.kind === "page" && last.page.id !== editor.activePageId) {
          void open(last.page.id);
        }
        return;
      }

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
    editor.selectedElementIds.length > 0
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
      return;
    }
    if (routePage.url.pathname !== "/editor") {
      await goto("/editor", { keepFocus: true });
    }
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

  function handleTreeContextMenu(event: MouseEvent) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const elementRow = target.closest<HTMLElement>("[data-element-id]");
    const elementId = elementRow?.dataset.elementId;

    const pageRow = target.closest<HTMLElement>("[data-page-id]");
    const pageId = pageRow?.dataset.pageId;

    if (elementId) {
      contextMenuElementId = elementId;
      if (!editor.isElementSelected(elementId)) editor.setElementSelection([elementId], elementId);
      contextMenuPageId = null;
      return;
    }
    if (pageId) {
      contextMenuPageId = pageId;
      contextMenuElementId = null;
      editor.clearElementSelection();
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

  function handleMenuSelect(value: string) {
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

  function handleTreeKeyup(ev: KeyboardEvent) {
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
        onblur={(ev) => {
          const newName = formatRename(ev.currentTarget.value);
          editor.renamePage(page.id, newName);
        }}
        onkeydown={(ev) => {
          if (ev.key === "Enter") {
            ev.stopPropagation();
            ev.currentTarget.blur();
          }
          if (ev.key === "Escape") {
            ev.stopPropagation();
            ev.currentTarget.value = page.name;
            renamingId = null;
          }
        }}
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
  <div class="flex grow gap-2 min-w-0">
    <BoxIcon class="size-4 shrink-0 opacity-60" />
    {#if renamingId === element.id}
      <input
        class="input p-0 text-xs grow"
        value={element.name}
        use:focusOnMount
        onclick={(ev) => ev.stopPropagation()}
        onblur={(ev) => {
          const newName = formatRename(ev.currentTarget.value);
          editor.elementsCollection?.update(element.id, { name: newName });
        }}
        onkeydown={(ev) => {
          if (ev.key === "Enter") {
            ev.stopPropagation();
            ev.currentTarget.blur();
          }
          if (ev.key === "Escape") {
            ev.stopPropagation();
            ev.currentTarget.value = element.name;
            renamingId = null;
          }
        }}
      />
    {:else}
      <span class="truncate">{element.name}</span>
      <span class="truncate opacity-50">{element.tag}</span>
      <div class="flex gap-2 shrink ml-auto items-center min-w-0">
        {#if element.bindings}
          <Link2Icon class="size-5 opacity-85" title="bindings" />
        {/if}
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
  <fieldset class="contents" disabled={!ability.can("update", "Page")}>
    {#if editor.projects.length === 0}
      <p class="p-3 opacity-60">
        No projects exist yet. Insert a project row in the database to start creating pages.
      </p>
    {/if}
    <Menu onSelect={(details) => handleMenuSelect(details.value)}>
      <Menu.ContextTrigger class="flex flex-1 overflow-y-auto ">
        <TreeView.Provider value={treeView}>
          <TreeView.Tree
            class="w-full"
            oncontextmenu={handleTreeContextMenu}
            onkeyup={(ev) => {
              handleTreeKeyup(ev);
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
