<script lang="ts">
  import { goto } from "$app/navigation";
  import { untrack } from "svelte";
  import type { SvelteHTMLElements } from "svelte/elements";
  import {
    ArrowDownIcon,
    ArrowUpIcon,
    BlocksIcon,
    BoxIcon,
    FilePlus2Icon,
    FileTextIcon,
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
  import { handleEditorKeydown } from "$lib/client/editor/editorKeyboard";
  import type { ElementRecord } from "$lib/page/elementTypes";
  import { sortedChildren } from "$lib/page/elementTypes";
  import type { PageRecord } from "$lib/page/pageTypes";
  import { focusOnMount } from "$lib/client/util/use";

  const editor = getEditorContext();
  type ProjectSelect = (typeof editor.projects)[number];

  let renamingId = $state<string | null>(null);
  let contextMenuPageId = $state<string | null>(null);
  let contextMenuElementId = $state<string | null>(null);
  let lastExpandedPageId: string | null = null;

  const contextMenuPage = $derived(
    contextMenuPageId ? editor.pages.state[contextMenuPageId] : undefined,
  );

  const contextMenuElement = $derived(
    contextMenuElementId ? editor.elements[contextMenuElementId] : undefined,
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

      return sortedChildren(editor.elements, null).map((element) =>
        elementNode(element, node.page.id),
      );
    }

    if (node.kind === "element") {
      return sortedChildren(editor.elements, node.element.id).map((element) =>
        elementNode(element, node.pageId),
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
    selectionMode: "single",
    expandOnClick: true,
    defaultExpandedValue: editor.projects.map((project) => `${project.id}`),
    onSelectionChange: (details) => {
      const node = details.selectedNodes[0];
      if (!node) return;

      if (node.kind === "project" || node.kind === "page") {
        editor.selectedElementId = null;
        if (node.kind === "page" && node.page.id !== editor.activePageId) open(node.page.id);
        return;
      }

      if (node.kind === "element") {
        editor.selectedElementId = node.element.id;
        expandParents(node);
      }
    },
  });

  const treeSelection = $derived(
    editor.selectedElementId
      ? `${editor.selectedElementId}`
      : editor.activePageId
        ? `${editor.activePageId}`
        : null,
  );

  $effect(() => {
    const activeId = editor.activePageId;
    if (!activeId || activeId === lastExpandedPageId) return;
    const active = editor.pages.state[activeId];
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
      const next = value ? [value] : [];
      if (current.length === next.length && current.every((item, index) => item === next[index])) {
        return;
      }
      treeView().setSelectedValue(next);
    });
  });

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

  function open(id: string) {
    editor.openPage(id);
    goto(`/editor?page=${id}`, { replaceState: true, keepFocus: true });
  }

  function addPage(projectId: string) {
    const id = editor.addPage(projectId);
    open(id);
    renamingId = id;
  }

  function removePage(id: string) {
    const next = editor.deletePage(id);
    contextMenuPageId = null;
    goto(next ? `/editor?page=${next}` : "/editor", { replaceState: true });
  }

  function handleTreeContextMenu(event: MouseEvent) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const elementRow = target.closest<HTMLElement>("[data-element-id]");
    const elementId = elementRow?.dataset.elementId;

    const pageRow = target.closest<HTMLElement>("[data-page-id]");
    const pageId = pageRow?.dataset.pageId;

    // if (!pageId) {
    //   event.preventDefault();
    //   event.stopPropagation();
    //   return;
    // }
    if (elementId) {
      contextMenuElementId = elementId;
      contextMenuPageId = null;
      return;
    }
    if (pageId) {
      contextMenuPageId = pageId;
      contextMenuElementId = null;
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

  function siblingPages(page: PageRecord) {
    return editor.children(page.projectId);
  }

  function move(page: PageRecord, direction: -1 | 1) {
    const siblings = siblingPages(page);
    const index = siblings.findIndex((item: PageRecord) => item.id === page.id);
    const target = siblings[index + direction];
    if (!target) return;
    editor.pages.update(page.id, {
      sortIndex: target.sortIndex,
      updatedAt: Date.now(),
    });
    editor.pages.update(target.id, {
      sortIndex: page.sortIndex,
      updatedAt: Date.now(),
    });
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
          editor.elementCollection?.remove(contextMenuElement.id);
          break;
      }
    }

    if (contextMenuPage) {
      switch (value) {
        case "move-up":
          move(contextMenuPage, -1);
          break;
        case "move-down":
          move(contextMenuPage, 1);
          break;
        case "rename":
          renamingId = contextMenuPage.id;
          break;
        case "delete":
          removePage(contextMenuPage.id);
          break;
      }
    }
  }
</script>

{#snippet projectLabel(project: ProjectSelect)}
  <BlocksIcon class="size-4 shrink-0 opacity-60" />
  <span class="font-semibold truncate">{project.name}</span>
  <span class="opacity-50 truncate">/{project.name}</span>
{/snippet}

{#snippet pageLabel(page: PageRecord)}
  <FileTextIcon class="size-4 shrink-0 opacity-60" />
  {#if renamingId === page.id}
    <input
      class="input min-w-0 flex-1 px-1 py-0"
      value={page.name}
      use:focusOnMount
      onclick={(event) => event.stopPropagation()}
      onblur={(event) => {
        const newName = formatRename(event.currentTarget.value);
        editor.renamePage(page.id, newName);
      }}
      onkeydown={(event) => {
        if (event.key === "Enter") {
          event.stopPropagation();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          event.stopPropagation();
          renamingId = null;
        }
      }}
    />
  {:else}
    <span class="truncate flex-1">{page.name}</span>
    <span class="opacity-50 truncate max-w-36">
      {editor.route(page.id)}
    </span>
  {/if}
{/snippet}

{#snippet elementLabel(element: ElementRecord)}
  {#if renamingId === element.id}
    <input
      class="input min-w-0 flex-1 px-1 py-0"
      value={element.name}
      use:focusOnMount
      onclick={(event) => event.stopPropagation()}
      onblur={(event) => {
        const newName = formatRename(event.currentTarget.value);
        editor.elementCollection?.update(element.id, { name: newName });
      }}
      onkeydown={(event) => {
        if (event.key === "Enter") {
          event.stopPropagation();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          event.stopPropagation();
          renamingId = null;
        }
      }}
    />
  {:else}
    <BoxIcon class="size-4 shrink-0 opacity-60" />
    <span class="truncate flex-1">{element.name || element.tag || element.kind}</span>
    <span class="opacity-50">{element.kind}</span>
  {/if}
{/snippet}

{#snippet treeNode(node: TreeNode, indexPath: number[])}
  {@const children = childrenOf(node)}
  <TreeView.NodeProvider value={{ node, indexPath }}>
    {#if node.kind === "project"}
      <TreeView.Branch>
        <TreeView.BranchControl>
          <TreeView.BranchIndicator />
          <div class="flex items-center justify-between grow">
            <TreeView.BranchText class="flex items-center gap-2">
              {@render projectLabel(node.project)}
            </TreeView.BranchText>
            <button
              class="p-2 rounded-full hover:bg-surface-300-700"
              title="New root page"
              onclick={(event) => {
                event.stopPropagation();
                addPage(node.project.id);
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
          <TreeView.BranchControl data-page-id={node.page.id}>
            <TreeView.BranchIndicator />
            <TreeView.BranchText class="flex min-w-0 flex-1 items-center gap-1">
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
        <TreeView.Item data-page-id={node.page.id}>
          <span class="flex min-w-0 flex-1 items-center gap-1">
            {@render pageLabel(node.page)}
          </span>
        </TreeView.Item>
      {/if}
    {:else if node.kind === "element"}
      {#if children.length > 0}
        <TreeView.Branch>
          <TreeView.BranchControl data-element-id={node.element.id}>
            <TreeView.BranchIndicator />
            <div class="flex grow justify-between">
              <TreeView.BranchText class="flex items-center gap-1">
                {@render elementLabel(node.element)}
              </TreeView.BranchText>
            </div>
          </TreeView.BranchControl>
          <TreeView.BranchContent>
            <TreeView.BranchIndentGuide />
            {#each children as child, index (child.id)}
              {@render treeNode(child, [...indexPath, index])}
            {/each}
          </TreeView.BranchContent>
        </TreeView.Branch>
      {:else}
        <TreeView.Item data-element-id={node.element.id} class="flex justify-between">
          <span class="flex items-center gap-1">
            {@render elementLabel(node.element)}
          </span>
        </TreeView.Item>
      {/if}
    {/if}
  </TreeView.NodeProvider>
{/snippet}

<div class="flex flex-col h-full min-h-0 text-xs">
  {#if editor.projects.length === 0}
    <p class="p-3 opacity-60">
      No projects exist yet. Insert a project row in the database to start creating pages.
    </p>
  {/if}
  <Menu onSelect={(details) => handleMenuSelect(details.value)}>
    <Menu.ContextTrigger class="flex-1 overflow-y-auto">
      <TreeView.Provider value={treeView}>
        <TreeView.Tree
          class="w-full"
          oncontextmenu={handleTreeContextMenu}
          onkeydown={(event) => handleEditorKeydown(editor, event)}
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
          {#if contextMenuPage}
            <Menu.Item value="move-up">
              <Menu.ItemText class="flex items-center w-full gap-2">
                <ArrowUpIcon class="size-4" />
                <span>Move up</span>
              </Menu.ItemText>
            </Menu.Item>
            <Menu.Item value="move-down">
              <Menu.ItemText class="flex items-center w-full gap-2">
                <ArrowDownIcon class="size-4" />
                <span>Move down</span>
              </Menu.ItemText>
            </Menu.Item>
          {/if}

          {#if contextMenuElement}
            <Menu.Item value="add">
              <Menu.ItemText class="flex items-center w-full gap-2">
                <ArrowUpIcon class="size-4" />
                <span>Add</span>
              </Menu.ItemText>
            </Menu.Item>
          {/if}
          <Menu.Item value="rename">
            <Menu.ItemText class="flex items-center w-full gap-2">
              <PencilIcon class="size-4" />
              <span>Rename</span>
            </Menu.ItemText>
          </Menu.Item>
          <Menu.Item value="delete" class="text-error-600-400">
            <Menu.ItemText class="flex items-center w-full gap-2">
              <Trash2Icon class="size-4" />
              <span>Delete</span>
            </Menu.ItemText>
          </Menu.Item>
        </Menu.Content>
      </Menu.Positioner>
    </Portal>
  </Menu>
</div>
