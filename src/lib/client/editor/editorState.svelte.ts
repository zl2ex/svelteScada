import { browser } from "$app/environment";
import { err, ok } from "neverthrow";
import { tick } from "svelte";
import { PatchCollection } from "$lib/client/live/patchCollection.svelte";
import { undoManager } from "$lib/client/history/undoManager";
import { getProjectElements } from "$lib/remote/editor.remote";
import { applyPageElementPatches, pageElementPatches } from "$live/pages";
import type { ProjectSelect, UserComponentSelect } from "$lib/sqlite/tables";
import type { ElementRecord, ElementKind } from "$lib/page/elementTypes";
import { elementParentError, findContainerInsertionTarget } from "$lib/page/elementTypes";
import { pagePath, pageRoute, sortedPages, type PageRecord } from "$lib/page/pageTypes";
import { attempt } from "$lib/util/attempt";
import {
  errorToString,
  neverThrowErrorToString,
  type NeverThrowError,
} from "$lib/util/neverThrow";
import { newId } from "$lib/util/newId";

const OPEN_PAGES_KEY = "editor-open-page-ids";
const MAX_FOCUS_HISTORY = 50;

const pageDocumentId = (pageId: string) => `page:${pageId}`;

export type UserComponentDefinition = {
  component: UserComponentSelect;
  elements: Record<string, ElementRecord>;
};

export type EditorMode = "edit" | "preview";

export type EditorLeftPanelTab = "tags" | "udts" | "pages";

export type EditorFocusSnapshot = {
  projectId: string | null;
  pageId: string | null;
  selectedElementId: string | null;
  tagSelectionIds: string[];
  leftPanelTab: EditorLeftPanelTab;
};

function focusEquals(a: EditorFocusSnapshot, b: EditorFocusSnapshot) {
  return (
    a.projectId === b.projectId &&
    a.pageId === b.pageId &&
    a.selectedElementId === b.selectedElementId &&
    a.tagSelectionIds.length === b.tagSelectionIds.length &&
    a.tagSelectionIds.every((id, index) => id === b.tagSelectionIds[index]) &&
    a.leftPanelTab === b.leftPanelTab
  );
}

export class EditorState {
  pagesCollection: PatchCollection<PageRecord, NeverThrowError>;
  elementsCollection = $state.raw<PatchCollection<ElementRecord, NeverThrowError> | null>(null);
  projects = $state<ProjectSelect[]>([]);
  userComponents = $state<UserComponentDefinition[]>([]);
  activeProjectId = $state<string | null>(null);
  activePageId = $state<string | null>(null);
  openPageIds = $state<string[]>([]);
  selectedElementId = $state<string | null>(null);
  tagSelectionIds = $state<string[]>([]);
  leftPanelTab = $state<EditorLeftPanelTab>("tags");
  projectLoading = $state(false);
  projectError = $state<string | null>(null);
  mode = $state<EditorMode>("edit");

  #pageCollections = $state.raw<
    Record<string, PatchCollection<ElementRecord, NeverThrowError>>
  >({});
  #projectReady = false;
  #focusHistory = $state.raw<EditorFocusSnapshot[]>([]);
  #focusFuture = $state.raw<EditorFocusSnapshot[]>([]);
  #suppressFocusRecord = false;
  #lastFocus: EditorFocusSnapshot = {
    projectId: null,
    pageId: null,
    selectedElementId: null,
    tagSelectionIds: [],
    leftPanelTab: "tags",
  };

  constructor(options: {
    pages: PatchCollection<PageRecord, NeverThrowError>;
    projects: ProjectSelect[];
    userComponents: UserComponentDefinition[];
  }) {
    this.pagesCollection = options.pages;
    this.projects = options.projects;
    this.userComponents = options.userComponents;
    this.#loadOpenPages();
  }

  get activePage(): PageRecord | null {
    if (!this.activePageId) return null;
    return this.pagesCollection.state[this.activePageId] ?? null;
  }

  get canFocusBack() {
    return this.#focusHistory.length > 0;
  }

  get canFocusForward() {
    return this.#focusFuture.length > 0;
  }

  get insertionTarget(): string | null {
    return findContainerInsertionTarget(
      this.elementsCollection?.state ?? {},
      this.selectedElementId,
    );
  }

  get insertionTargetElement(): ElementRecord | null {
    const id = this.insertionTarget;
    return id ? (this.elementsCollection?.state[id] ?? null) : null;
  }

  pagePath(id: string) {
    return pagePath(this.pagesCollection.state, id);
  }

  route(id: string) {
    const page = this.pagesCollection.state[id];
    if (!page) return "/editor";
    const project = this.projects.find((item) => item.id === page.projectId);
    return pageRoute(this.pagesCollection.state, project?.name ?? "project", id);
  }

  projectForPage(page: PageRecord) {
    return this.projects.find((project) => project.id === page.projectId);
  }

  children(projectId?: string) {
    const pages = Object.fromEntries(
      Object.entries(this.pagesCollection.state).filter(
        ([, page]) => projectId === undefined || page.projectId === projectId,
      ),
    );
    return sortedPages(pages);
  }

  async openProject(projectId: string) {
    if (this.activeProjectId === projectId && this.#projectReady) return ok(null);

    if (!this.projects.some((project) => project.id === projectId)) {
      return err({
        reason: "PROJECT_NOT_FOUND",
        cause: `project ${projectId} does not exist`,
      } as const satisfies NeverThrowError);
    }

    this.projectLoading = true;
    this.projectError = null;
    const loaded = await attempt(() => getProjectElements(projectId));
    this.projectLoading = false;

    if (loaded.isErr) {
      const cause = errorToString(loaded.error);
      this.projectError = cause;
      return err({
        reason: "PROJECT_ELEMENTS_LOAD_FAILED",
        cause,
      } as const satisfies NeverThrowError);
    }

    if (loaded.data.isErr) {
      this.projectError = neverThrowErrorToString(loaded.data.error);
      return err(loaded.data.error);
    }

    const elementsByPage = loaded.data.value;
    const nextCollections = Object.fromEntries(
      this.children(projectId).map((page) => [
        page.id,
        this.#createPageCollection(page.id, elementsByPage[page.id] ?? {}),
      ]),
    ) as Record<string, PatchCollection<ElementRecord, NeverThrowError>>;

    this.#disposePageCollections();
    this.activeProjectId = projectId;
    this.#pageCollections = nextCollections;
    this.#projectReady = true;
    this.setActivePage(null);
    return ok(null);
  }

  setActivePage(id: string | null) {
    const page = id ? this.pagesCollection.state[id] : undefined;
    const nextId = page ? id : null;
    const collection =
      page && this.activeProjectId === page.projectId && this.#projectReady
        ? this.#ensurePageCollection(page.id)
        : null;

    this.activePageId = nextId;
    this.selectedElementId = null;
    this.elementsCollection = collection;
    undoManager.setActiveDocument(nextId ? pageDocumentId(nextId) : null);

    if (nextId && !this.openPageIds.includes(nextId)) {
      this.openPageIds = [...this.openPageIds, nextId];
      this.#persistOpenPages();
    }
  }

  async openPage(id: string) {
    const page = this.pagesCollection.state[id];
    if (!page) {
      return err({
        reason: "PAGE_NOT_FOUND",
        cause: `page ${id} does not exist`,
      } as const satisfies NeverThrowError);
    }

    if (this.activeProjectId !== page.projectId || !this.#projectReady) {
      const opened = await this.openProject(page.projectId);
      if (opened.isErr()) return err(opened.error);
    }

    this.setActivePage(id);
    return ok(null);
  }

  closePage(id: string) {
    const closing = this.pagesCollection.state[id];
    this.openPageIds = this.openPageIds.filter((pageId) => pageId !== id);
    this.#persistOpenPages();

    if (this.activePageId !== id) return this.activePageId;

    const projectId = closing?.projectId ?? this.activeProjectId;
    const next =
      [...this.openPageIds].reverse().find((pageId) => {
        const page = this.pagesCollection.state[pageId];
        return page && (!projectId || page.projectId === projectId);
      }) ?? null;

    this.setActivePage(next);
    return next;
  }

  addPage(projectId: string) {
    const siblings = this.children(projectId);
    let index = siblings.length + 1;
    let name = `page-${index}`;
    while (siblings.some((page) => page.name === name)) {
      index++;
      name = `page-${index}`;
    }

    const now = Date.now();
    const page: PageRecord = {
      id: newId(),
      projectId,
      name,
      containerType: "absolute",
      sortIndex: Math.max(-1, ...siblings.map((item) => item.sortIndex)) + 1,
      createdAt: now,
      updatedAt: now,
    };
    this.pagesCollection.add(page);
    if (this.activeProjectId === projectId && this.#projectReady) {
      this.#ensurePageCollection(page.id);
    }
    return page.id;
  }

  renamePage(id: string, name: string) {
    this.pagesCollection.update(id, { name, updatedAt: Date.now() });
  }

  deletePage(id: string) {
    const next = this.closePage(id);
    this.#disposePageCollection(id);
    this.pagesCollection.remove(id);
    return next;
  }

  addElement(
    kind: ElementKind,
    options: {
      tag?: string | null;
      baseComponent?: string | null;
      referencedComponentId?: string | null;
      name?: string;
      attributes?: Record<string, string | number | boolean>;
    } = {},
  ) {
    const collection = this.elementsCollection;
    if (!collection) return null;
    const parentId = this.insertionTarget;
    const parent = parentId ? (collection.state[parentId] ?? null) : null;
    const siblings = Object.values(collection.state).filter(
      (element) => element.parentId === parentId,
    );
    const now = Date.now();
    const id = newId();
    const element: ElementRecord = {
      id,
      parentId,
      sortIndex: Math.max(-1, ...siblings.map((item) => item.sortIndex)) + 1,
      kind,
      tag: options.tag ?? null,
      baseComponent: options.baseComponent ?? null,
      referencedComponentId: options.referencedComponentId ?? null,
      name: options.name ?? options.tag ?? options.baseComponent ?? kind,
      text: null,
      containerType: "none",
      attributes: options.attributes ?? {},
      bindings: null,
      createdAt: now,
      updatedAt: now,
    };
    if (elementParentError(element, parent)) return null;
    collection.add(element);
    this.selectedElementId = id;
    return id;
  }

  removeElement(id: string) {
    this.elementsCollection?.remove(id);
    if (this.selectedElementId === id) this.selectedElementId = null;
  }

  snapshotFocus(): EditorFocusSnapshot {
    return {
      projectId: this.activeProjectId,
      pageId: this.activePageId,
      selectedElementId: this.selectedElementId,
      tagSelectionIds: [...this.tagSelectionIds],
      leftPanelTab: this.leftPanelTab,
    };
  }

  trackFocus() {
    const next = this.snapshotFocus();
    if (this.#suppressFocusRecord) {
      this.#lastFocus = next;
      return;
    }
    if (focusEquals(this.#lastFocus, next)) return;

    this.#focusHistory = [...this.#focusHistory, this.#lastFocus].slice(-MAX_FOCUS_HISTORY);
    this.#focusFuture = [];
    this.#lastFocus = next;
  }

  async backFocus() {
    const target = this.#focusHistory.at(-1);
    if (!target) return ok(null);

    const current = this.snapshotFocus();
    this.#suppressFocusRecord = true;
    const applied = await this.#applyFocus(target);
    if (applied.isErr()) {
      this.#suppressFocusRecord = false;
      return err(applied.error);
    }

    this.#focusHistory = this.#focusHistory.slice(0, -1);
    this.#focusFuture = [...this.#focusFuture, current];
    await tick();
    this.#lastFocus = this.snapshotFocus();
    this.#suppressFocusRecord = false;
    return ok(null);
  }

  async forwardFocus() {
    const target = this.#focusFuture.at(-1);
    if (!target) return ok(null);

    const current = this.snapshotFocus();
    this.#suppressFocusRecord = true;
    const applied = await this.#applyFocus(target);
    if (applied.isErr()) {
      this.#suppressFocusRecord = false;
      return err(applied.error);
    }

    this.#focusFuture = this.#focusFuture.slice(0, -1);
    this.#focusHistory = [...this.#focusHistory, current].slice(-MAX_FOCUS_HISTORY);
    await tick();
    this.#lastFocus = this.snapshotFocus();
    this.#suppressFocusRecord = false;
    return ok(null);
  }

  dispose() {
    this.#disposePageCollections();
    this.activeProjectId = null;
    this.activePageId = null;
    this.selectedElementId = null;
    this.leftPanelTab = "tags";
    this.#focusHistory = [];
    this.#focusFuture = [];
    this.#lastFocus = this.snapshotFocus();
  }

  async #applyFocus(snapshot: EditorFocusSnapshot) {
    if (snapshot.projectId) {
      if (this.activeProjectId !== snapshot.projectId || !this.#projectReady) {
        const opened = await this.openProject(snapshot.projectId);
        if (opened.isErr()) return err(opened.error);
      }
    } else if (this.activeProjectId !== null) {
      this.#disposePageCollections();
      this.activeProjectId = null;
      this.setActivePage(null);
    }

    const page = snapshot.pageId ? this.pagesCollection.state[snapshot.pageId] : undefined;
    if (page && (!snapshot.projectId || page.projectId === snapshot.projectId)) {
      this.setActivePage(page.id);
      if (
        snapshot.selectedElementId &&
        this.elementsCollection?.state[snapshot.selectedElementId]
      ) {
        this.selectedElementId = snapshot.selectedElementId;
      }
    } else {
      this.setActivePage(null);
    }

    this.leftPanelTab = snapshot.leftPanelTab;
    this.tagSelectionIds = [...snapshot.tagSelectionIds];
    return ok(null);
  }

  #createPageCollection(pageId: string, initial: Record<string, ElementRecord>) {
    const documentId = pageDocumentId(pageId);
    const collection = new PatchCollection<ElementRecord, NeverThrowError>({
      initial,
      applyPatch: (patch) => applyPageElementPatches({ pageId, patch }),
      subscribePatches: (notify) => {
        const unsubscribe = pageElementPatches(pageId).subscribe((payload) => {
          if (!payload || "error" in payload) {
            notify(null);
            return;
          }
          notify(payload);
        });
        return unsubscribe;
      },
      maxHistory: 100,
      onMutation: () => undoManager.recordMutation(documentId),
      onError: (error) => console.error("Element sync error:", error),
    });

    undoManager.register(documentId, collection, "document");
    return collection;
  }

  #ensurePageCollection(pageId: string, initial: Record<string, ElementRecord> = {}) {
    const existing = this.#pageCollections[pageId];
    if (existing) return existing;

    const collection = this.#createPageCollection(pageId, initial);
    this.#pageCollections = {
      ...this.#pageCollections,
      [pageId]: collection,
    };
    return collection;
  }

  #disposePageCollection(pageId: string) {
    const collection = this.#pageCollections[pageId];
    if (!collection) return;

    const documentId = pageDocumentId(pageId);
    undoManager.clearHistory(documentId);
    undoManager.unregister(documentId);
    collection.dispose();

    const next = { ...this.#pageCollections };
    delete next[pageId];
    this.#pageCollections = next;

    if (this.elementsCollection === collection) {
      this.elementsCollection = null;
      this.selectedElementId = null;
      undoManager.setActiveDocument(null);
    }
  }

  #disposePageCollections() {
    for (const [pageId, collection] of Object.entries(this.#pageCollections)) {
      const documentId = pageDocumentId(pageId);
      undoManager.clearHistory(documentId);
      undoManager.unregister(documentId);
      collection.dispose();
    }

    this.#pageCollections = {};
    this.#projectReady = false;
    this.elementsCollection = null;
    this.selectedElementId = null;
    undoManager.setActiveDocument(null);
  }

  #loadOpenPages() {
    if (!browser) return;
    const raw = attempt(() => localStorage.getItem(OPEN_PAGES_KEY));
    if (raw.isErr || !raw.data) return;
    const parsed = attempt(() => JSON.parse(raw.data!));
    if (parsed.isErr || !Array.isArray(parsed.data)) return;
    this.openPageIds = parsed.data.filter(
      (id): id is string => typeof id === "string" && Boolean(this.pagesCollection.state[id]),
    );
  }

  #persistOpenPages() {
    if (!browser) return;
    attempt(() => localStorage.setItem(OPEN_PAGES_KEY, JSON.stringify(this.openPageIds)));
  }
}
