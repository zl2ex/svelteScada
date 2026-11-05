import { browser } from "$app/environment";
import { err, ok } from "neverthrow";
import { tick } from "svelte";
import { PatchCollection } from "$lib/client/live/patchCollection.svelte";
import { undoManager } from "$lib/client/history/undoManager";
import { getProjectElements } from "$lib/remote/editor.remote";
import { applyPageElementPatches, pageElementPatches } from "$live/pages";
import type { ProjectSelect, UserComponentSelect, UserThemeSelect } from "$lib/sqlite/tables";
import type {
  ElementRecord,
  ElementKind,
  ElementAttributes,
  ElementStyle,
} from "$lib/elements/elementTypes";
import {
  elementParentError,
  findContainerInsertionTarget,
  sortedChildren,
} from "$lib/elements/elementTypes";
import { getDefaultElementConfig } from "$lib/elements/defaults";
import { pagePath, pageRoute, sortedPages, type PageRecord } from "$lib/elements/pageTypes";
import { attempt } from "$lib/util/attempt";
import { errorToString, neverThrowErrorToString, type NeverThrowError } from "$lib/util/neverThrow";
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
  selectedElementIds: string[];
  tagSelectionIds: string[];
  leftPanelTab: EditorLeftPanelTab;
};

function stringArraysEqual(a: string[], b: string[]) {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function focusEquals(a: EditorFocusSnapshot, b: EditorFocusSnapshot) {
  return (
    a.projectId === b.projectId &&
    a.pageId === b.pageId &&
    stringArraysEqual(a.selectedElementIds, b.selectedElementIds) &&
    stringArraysEqual(a.tagSelectionIds, b.tagSelectionIds) &&
    a.leftPanelTab === b.leftPanelTab
  );
}

export class EditorState {
  pagesCollection: PatchCollection<PageRecord, NeverThrowError>;
  userThemesCollection: PatchCollection<UserThemeSelect, NeverThrowError>;
  elementsCollection = $state.raw<PatchCollection<ElementRecord, NeverThrowError> | null>(null);
  projects = $state<ProjectSelect[]>([]);
  userComponents = $state<UserComponentDefinition[]>([]);
  activeProjectId = $state<string | null>(null);
  activePageId = $state<string | null>(null);
  openPageIds = $state<string[]>([]);
  selectedElementIds = $state<string[]>([]);
  tagSelectionIds = $state<string[]>([]);
  leftPanelTab = $state<EditorLeftPanelTab>("tags");
  projectLoading = $state(false);
  projectError = $state<string | null>(null);
  mode = $state<EditorMode>("edit");

  #pageCollections = $state.raw<Record<string, PatchCollection<ElementRecord, NeverThrowError>>>(
    {},
  );
  #projectReady = false;
  #focusHistory = $state.raw<EditorFocusSnapshot[]>([]);
  #focusFuture = $state.raw<EditorFocusSnapshot[]>([]);
  #suppressFocusRecord = false;
  #lastFocus: EditorFocusSnapshot = {
    projectId: null,
    pageId: null,
    selectedElementIds: [],
    tagSelectionIds: [],
    leftPanelTab: "tags",
  };

  constructor(options: {
    pages: PatchCollection<PageRecord, NeverThrowError>;
    userThemes: PatchCollection<UserThemeSelect, NeverThrowError>;
    projects: ProjectSelect[];
    userComponents: UserComponentDefinition[];
  }) {
    this.pagesCollection = options.pages;
    this.userThemesCollection = options.userThemes;
    this.projects = options.projects;
    this.userComponents = options.userComponents;
    this.#loadOpenPages();
  }

  get activeProject(): ProjectSelect | null {
    if (!this.activeProjectId) return null;
    return this.projects.find((project) => project.id === this.activeProjectId) ?? null;
  }

  get themes(): UserThemeSelect[] {
    return Object.values(this.userThemesCollection.state).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  get activeTheme(): UserThemeSelect | null {
    const project = this.activeProject;
    const themes = this.userThemesCollection.state;
    return (project?.themeId ? themes[project.themeId] : undefined) ?? this.themes[0] ?? null;
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

  get primarySelectedElementId(): string | null {
    return this.selectedElementIds.at(-1) ?? null;
  }

  get selectedElements(): ElementRecord[] {
    const state = this.elementsCollection?.state ?? {};
    return this.selectedElementIds.map((id) => state[id]).filter(Boolean);
  }

  get insertionTarget(): string | null {
    return findContainerInsertionTarget(
      this.elementsCollection?.state ?? {},
      this.primarySelectedElementId,
    );
  }

  isElementSelected(id: string) {
    return this.selectedElementIds.includes(id);
  }

  setElementSelection(ids: string[], primaryId: string | null = null) {
    const unique = [...new Set(ids)].filter((id) => this.elementsCollection?.state[id]);
    if (primaryId && unique.includes(primaryId)) {
      this.selectedElementIds = [...unique.filter((id) => id !== primaryId), primaryId];
      return;
    }
    this.selectedElementIds = unique;
  }

  clearElementSelection() {
    this.selectedElementIds = [];
  }

  selectElement(id: string, options: { additive?: boolean; range?: boolean } = {}) {
    if (options.range) {
      const order = this.#elementOrder();
      const targetIndex = order.indexOf(id);
      const anchor = this.selectedElementIds[0];
      const anchorIndex = anchor ? order.indexOf(anchor) : -1;

      if (targetIndex < 0) return;
      if (anchorIndex < 0) {
        this.setElementSelection([id], id);
        return;
      }

      const start = Math.min(anchorIndex, targetIndex);
      const end = Math.max(anchorIndex, targetIndex);
      this.setElementSelection(order.slice(start, end + 1), id);
      return;
    }

    if (options.additive) {
      const next = this.selectedElementIds.includes(id)
        ? this.selectedElementIds.filter((selectedId) => selectedId !== id)
        : [...this.selectedElementIds, id];
      this.setElementSelection(next, next.at(-1) ?? null);
      return;
    }

    this.setElementSelection([id], id);
  }

  #elementOrder() {
    const state = this.elementsCollection?.state ?? {};
    const order: string[] = [];
    const visit = (parentId: string | null) => {
      for (const element of sortedChildren(state, parentId)) {
        order.push(element.id);
        visit(element.id);
      }
    };
    visit(null);
    return order;
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
    this.clearElementSelection();
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
      attributes?: ElementAttributes;
      style?: ElementStyle;
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
    const defaults = getDefaultElementConfig(kind, options);
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
      attributes: { ...defaults.attributes, ...options.attributes },
      style: { ...defaults.style, ...options.style },
      styleClass: [],
      bindings: null,
      createdAt: now,
      updatedAt: now,
    };
    if (elementParentError(element, parent)) return null;
    collection.add(element);
    this.setElementSelection([id], id);
    return id;
  }

  removeElement(id: string) {
    this.elementsCollection?.remove(id);
    this.setElementSelection(this.selectedElementIds.filter((selectedId) => selectedId !== id));
  }

  removeSelectedElements() {
    const ids = [...this.selectedElementIds];
    if (ids.length === 0) return;
    this.elementsCollection?.removeMany(ids);
    this.clearElementSelection();
  }

  snapshotFocus(): EditorFocusSnapshot {
    return {
      projectId: this.activeProjectId,
      pageId: this.activePageId,
      selectedElementIds: [...this.selectedElementIds],
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
    this.clearElementSelection();
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
      const selectedIds = snapshot.selectedElementIds.filter(
        (id) => this.elementsCollection?.state[id],
      );
      this.setElementSelection(selectedIds, selectedIds.at(-1) ?? null);
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
      this.clearElementSelection();
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
    this.clearElementSelection();
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
