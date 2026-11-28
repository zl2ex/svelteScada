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
  ElementProperties,
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
import { clampCanvasZoom, stepCanvasZoom } from "./canvasZoom";

const OPEN_PAGES_KEY = "editor-open-page-ids";
const MAX_FOCUS_HISTORY = 50;

/**
 * Builds the undo-manager document id for a page.
 * @param pageId - Page id to encode.
 * @returns The namespaced document id.
 */
const pageDocumentId = (pageId: string) => `page:${pageId}`;

export type UserComponentDefinition = {
  component: UserComponentSelect;
  elements: Record<string, ElementRecord>;
};

export type EditorMode = "edit" | "preview";

export type EditorGrid = {
  spacing: number;
  enabled: boolean;
};

export type EditorLeftPanelTab = "tags" | "udts" | "projects";

export type EditorFocusSnapshot = {
  projectId: string | null;
  pageId: string | null;
  selectedElementIds: string[];
  tagSelectionIds: string[];
  leftPanelTab: EditorLeftPanelTab;
  path: string;
};

/**
 * Checks whether two string arrays have equal length and identical entries.
 * @param a - First array.
 * @param b - Second array.
 * @returns True when both arrays match.
 */
function stringArraysEqual(a: string[], b: string[]) {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/**
 * Compares two editor focus snapshots for equality.
 * @param a - First snapshot.
 * @param b - Second snapshot.
 * @returns True when every focus field matches.
 */
function focusEquals(a: EditorFocusSnapshot, b: EditorFocusSnapshot) {
  return (
    a.projectId === b.projectId &&
    a.pageId === b.pageId &&
    stringArraysEqual(a.selectedElementIds, b.selectedElementIds) &&
    stringArraysEqual(a.tagSelectionIds, b.tagSelectionIds) &&
    a.leftPanelTab === b.leftPanelTab &&
    a.path === b.path
  );
}

export class EditorState {
  pagesCollection: PatchCollection<PageRecord, NeverThrowError>;
  userThemesCollection: PatchCollection<UserThemeSelect, NeverThrowError>;
  elementsCollection = $state.raw<PatchCollection<ElementRecord, NeverThrowError> | null>(null);
  projects: PatchCollection<ProjectSelect, NeverThrowError>;
  userComponents = $state<UserComponentDefinition[]>([]);
  activeProjectId = $state<string | null>(null);
  activePageId = $state<string | null>(null);
  openPageIds = $state<string[]>([]);
  selectedProjectId = $state<string | null>(null);
  selectedElementIds = $state<string[]>([]);
  tagSelectionIds = $state<string[]>([]);
  leftPanelTab = $state<EditorLeftPanelTab>("tags");
  projectLoading = $state(false);
  projectError = $state<string | null>(null);
  mode = $state<EditorMode>("edit");
  grid = $state<EditorGrid>({ spacing: 5, enabled: true });
  canvasZoom = $state(1);
  canvasPanX = $state(0);
  canvasPanY = $state(0);
  canvasViewResetToken = $state(0);

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
    path: "/editor",
  };

  /**
   * Creates the editor state and restores persisted open pages.
   * @param options - Collections, user components, and the initial route path.
   */
  constructor(options: {
    pages: PatchCollection<PageRecord, NeverThrowError>;
    userThemes: PatchCollection<UserThemeSelect, NeverThrowError>;
    projects: PatchCollection<ProjectSelect, NeverThrowError>;
    userComponents: UserComponentDefinition[];
    initialPath: string;
  }) {
    this.pagesCollection = options.pages;
    this.userThemesCollection = options.userThemes;
    this.projects = options.projects;
    this.userComponents = options.userComponents;
    this.#lastFocus = { ...this.#lastFocus, path: options.initialPath };
    this.#loadOpenPages();
  }

  /**
   * Returns the currently opened project.
   * @returns The active project, or null when none is open.
   */
  get activeProject(): ProjectSelect | null {
    if (!this.activeProjectId) return null;
    return this.projects.state[this.activeProjectId] ?? null;
  }

  /**
   * Lists all projects sorted by name.
   * @returns Projects in alphabetical order.
   */
  get projectList(): ProjectSelect[] {
    return Object.values(this.projects.state).sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Lists all user themes sorted by name.
   * @returns Themes in alphabetical order.
   */
  get themes(): UserThemeSelect[] {
    return Object.values(this.userThemesCollection.state).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  /**
   * Resolves the theme for the active project, falling back to the first theme.
   * @returns The active theme, or null when no themes exist.
   */
  get activeTheme(): UserThemeSelect | null {
    const project = this.activeProject;
    const themes = this.userThemesCollection.state;
    return (project?.themeId ? themes[project.themeId] : undefined) ?? this.themes[0] ?? null;
  }

  /**
   * Returns the currently opened page.
   * @returns The active page, or null when none is open.
   */
  get activePage(): PageRecord | null {
    if (!this.activePageId) return null;
    return this.pagesCollection.state[this.activePageId] ?? null;
  }

  /**
   * Reports whether the focus history has an entry to go back to.
   * @returns True when a back navigation is available.
   */
  get canFocusBack() {
    return this.#focusHistory.length > 0;
  }

  /**
   * Reports whether the focus future has an entry to go forward to.
   * @returns True when a forward navigation is available.
   */
  get canFocusForward() {
    return this.#focusFuture.length > 0;
  }

  /**
   * Returns the last selected element id as the primary selection.
   * @returns The primary element id, or null when nothing is selected.
   */
  get primarySelectedElementId(): string | null {
    return this.selectedElementIds.at(-1) ?? null;
  }

  /**
   * Returns the records for all currently selected elements.
   * @returns Selected element records in selection order.
   */
  get selectedElements(): ElementRecord[] {
    const state = this.elementsCollection?.state ?? {};
    return this.selectedElementIds.map((id) => state[id]).filter(Boolean);
  }

  /**
   * Resolves where new elements should be inserted based on the selection.
   * @returns The target parent element id, or null for the page root.
   */
  get insertionTarget(): string | null {
    return findContainerInsertionTarget(
      this.elementsCollection?.state ?? {},
      this.primarySelectedElementId,
    );
  }

  /**
   * Checks whether an element is part of the current selection.
   * @param id - Element id to test.
   * @returns True when the element is selected.
   */
  isElementSelected(id: string) {
    return this.selectedElementIds.includes(id);
  }

  /**
   * Replaces the element selection, deduplicating ids and keeping only loaded elements.
   * @param ids - Element ids to select.
   * @param [primaryId] - Element id to place last as the primary selection (defaults to null).
   */
  setElementSelection(ids: string[], primaryId: string | null = null) {
    const unique = [...new Set(ids)].filter((id) => this.elementsCollection?.state[id]);
    if (primaryId && unique.includes(primaryId)) {
      this.selectedElementIds = [...unique.filter((id) => id !== primaryId), primaryId];
    } else {
      this.selectedElementIds = unique;
    }

    /*this.selectedElementIds.forEach((id) => {
      const element = document.querySelector<HTMLElement>(`#editor-canvas [data-element-id=${id}]`);
      element?.focus();
      // TD WIP focus not working...
    });*/
  }

  /**
   * Clears the current element selection.
   */
  clearElementSelection() {
    this.selectedElementIds = [];
  }

  /**
   * Selects a project and clears any element selection.
   * @param id - Project id to select.
   */
  selectProject(id: string) {
    if (!this.projects.state[id]) return;
    this.selectedProjectId = id;
    this.clearElementSelection();
  }

  /**
   * Clears the currently selected project.
   */
  clearProjectSelection() {
    this.selectedProjectId = null;
  }

  /**
   * Updates the element selection for a plain, additive, or range click.
   * @param id - Element id to select.
   * @param [options] - Additive or range selection flags (defaults to {}).
   */
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

  /**
   * Flattens the page element tree into depth-first selection order.
   * @returns Element ids in visual tree order.
   */
  #elementOrder() {
    const state = this.elementsCollection?.state ?? {};
    const order: string[] = [];
    /**
     * Appends a parent's children and their descendants to the order list.
     * @param parentId - Parent element id, or null for the page root.
     */
    const visit = (parentId: string | null) => {
      for (const element of sortedChildren(state, parentId)) {
        order.push(element.id);
        visit(element.id);
      }
    };
    visit(null);
    return order;
  }

  /**
   * Returns the element record for the current insertion target.
   * @returns The target element, or null when none is available.
   */
  get insertionTargetElement(): ElementRecord | null {
    const id = this.insertionTarget;
    return id ? (this.elementsCollection?.state[id] ?? null) : null;
  }

  /**
   * Builds the full path for a page.
   * @param id - Page id to resolve.
   * @returns The page path.
   */
  pagePath(id: string) {
    return pagePath(this.pagesCollection.state, id);
  }

  /**
   * Builds the editor route for a page.
   * @param id - Page id to resolve.
   * @returns The page route, or the editor route when the page is missing.
   */
  route(id: string) {
    const page = this.pagesCollection.state[id];
    if (!page) return "/editor";
    const project = this.projects.state[page.projectId];
    return pageRoute(this.pagesCollection.state, project?.name ?? "project", id);
  }

  /**
   * Returns the project that owns a page.
   * @param page - Page to resolve.
   * @returns The owning project record.
   */
  projectForPage(page: PageRecord) {
    return this.projects.state[page.projectId];
  }

  /**
   * Lists the pages belonging to a project.
   * @param [projectId] - Project to filter by; all pages when omitted.
   * @returns Sorted page records.
   */
  children(projectId?: string) {
    const pages = Object.fromEntries(
      Object.entries(this.pagesCollection.state).filter(
        ([, page]) => projectId === undefined || page.projectId === projectId,
      ),
    );
    return sortedPages(pages);
  }

  /**
   * Returns the loaded element state for a page.
   * @param pageId - Page id to inspect.
   * @returns The loaded element map, or null when the page collection is not loaded.
   */
  getPageElementsSnapshot(pageId: string) {
    return this.#pageCollections[pageId]?.state ?? null;
  }

  /**
   * Adds elements to a page in the active project.
   * @param pageId - Page that will own the elements.
   * @param elements - Element records to insert.
   * @returns A neverthrow result indicating whether the elements were added.
   */
  addElementsToPage(pageId: string, elements: ElementRecord[]) {
    const page = this.pagesCollection.state[pageId];
    if (!page) {
      return err({
        reason: "PAGE_NOT_FOUND",
        cause: `page ${pageId} does not exist`,
      } as const satisfies NeverThrowError);
    }
    if (this.activeProjectId !== page.projectId || !this.#projectReady) {
      return err({
        reason: "PROJECT_NOT_LOADED",
        cause: `project ${page.projectId} must be open before adding elements`,
      } as const satisfies NeverThrowError);
    }
    if (elements.length === 0) return ok(null);

    this.#ensurePageCollection(pageId).addMany(elements);
    return ok(null);
  }

  /**
   * Loads a project's element collections and marks it ready for editing.
   * @param projectId - Project id to open.
   * @returns Ok when the project is ready, or Err with the load failure.
   */
  async openProject(projectId: string) {
    if (this.activeProjectId === projectId && this.#projectReady) return ok(null);

    const project = this.projects.state[projectId];
    if (!project) {
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
    this.grid = {
      enabled: project.grid_enabled,
      spacing: project.grid_spacing,
    };
    this.setActivePage(null);
    return ok(null);
  }

  /**
   * Updates the editor grid and persists the change to the active project.
   * @param next - Partial grid settings to merge.
   */
  setGrid(next: Partial<EditorGrid>) {
    this.grid = { ...this.grid, ...next };
    const project = this.activeProject;
    if (!project) return;
    this.projects.update(project.id, {
      grid_enabled: this.grid.enabled,
      grid_spacing: this.grid.spacing,
      updatedAt: Date.now(),
    });
  }

  /**
   * Sets the canvas zoom, clamped to the supported range.
   * @param value - Desired zoom factor.
   */
  setCanvasZoom(value: number) {
    this.canvasZoom = clampCanvasZoom(value);
  }

  /**
   * Steps the canvas zoom up by one increment.
   */
  zoomIn() {
    this.canvasZoom = stepCanvasZoom(this.canvasZoom, 1);
  }

  /**
   * Steps the canvas zoom down by one increment.
   */
  zoomOut() {
    this.canvasZoom = stepCanvasZoom(this.canvasZoom, -1);
  }

  /**
   * Sets the canvas pan offset.
   * @param x - Horizontal offset.
   * @param y - Vertical offset.
   */
  setCanvasPan(x: number, y: number) {
    this.canvasPanX = x;
    this.canvasPanY = y;
  }

  /**
   * Offsets the canvas pan by the given delta.
   * @param dx - Horizontal delta.
   * @param dy - Vertical delta.
   */
  panBy(dx: number, dy: number) {
    this.canvasPanX += dx;
    this.canvasPanY += dy;
  }

  /**
   * Resets zoom and pan, and signals the canvas view to reset.
   */
  resetCanvasZoom() {
    this.canvasZoom = 1;
    this.canvasPanX = 0;
    this.canvasPanY = 0;
    this.canvasViewResetToken++;
  }

  /**
   * Switches the active page and binds its element collection to the undo manager.
   * @param id - Page id to activate, or null to clear the active page.
   */
  setActivePage(id: string | null) {
    const page = id ? this.pagesCollection.state[id] : undefined;
    const nextId = page ? id : null;
    const collection =
      page && this.activeProjectId === page.projectId && this.#projectReady
        ? this.#ensurePageCollection(page.id)
        : null;

    this.activePageId = nextId;
    this.selectedProjectId = null;
    this.clearElementSelection();
    this.elementsCollection = collection;
    undoManager.setActiveDocument(nextId ? pageDocumentId(nextId) : null);

    if (nextId && !this.openPageIds.includes(nextId)) {
      this.openPageIds = [...this.openPageIds, nextId];
      this.#persistOpenPages();
    }
  }

  /**
   * Opens a page, loading its project first when necessary.
   * @param id - Page id to open.
   * @returns Ok when the page is active, or Err when the page or project cannot open.
   */
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

  /**
   * Removes a page from the open tabs and activates a neighbouring page when needed.
   * @param id - Page id to close.
   * @returns The id of the newly active page, or null when none is active.
   */
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

  /**
   * Creates and selects a new project with a generated unique name.
   * @returns The id of the new project.
   */
  addProject() {
    const names = new Set(this.projectList.map((project) => project.name));
    let index = this.projectList.length + 1;
    let name = `project-${index}`;
    while (names.has(name)) {
      index++;
      name = `project-${index}`;
    }

    const now = Date.now();
    const project: ProjectSelect = {
      id: newId(),
      name,
      version: "0.0.0",
      description: null,
      themeId: null,
      grid_enabled: true,
      grid_spacing: 5,
      createdAt: now,
      updatedAt: now,
    };

    this.projects.add(project);
    this.selectProject(project.id);
    return project.id;
  }

  /**
   * Removes a project, its open pages, and disposes its collections when active.
   * @param id - Project id to remove.
   */
  removeProject(id: string) {
    if (!this.projects.state[id]) return;

    const pageIds = new Set(this.children(id).map((page) => page.id));
    this.openPageIds = this.openPageIds.filter((pageId) => !pageIds.has(pageId));
    this.#persistOpenPages();

    if (this.activeProjectId === id) {
      this.#disposePageCollections();
      this.activeProjectId = null;
      this.#projectReady = false;
      this.setActivePage(null);
    }
    if (this.selectedProjectId === id) this.selectedProjectId = null;

    this.projects.remove(id);
  }

  /**
   * Creates a new page under a project with a generated unique name.
   * @param projectId - Project that will own the page.
   * @returns The id of the new page.
   */
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

  /**
   * Renames a page and updates its timestamp.
   * @param id - Page id to rename.
   * @param name - New page name.
   */
  renamePage(id: string, name: string) {
    this.pagesCollection.update(id, { name, updatedAt: Date.now() });
  }

  /**
   * Closes and deletes a page along with its element collection.
   * @param id - Page id to delete.
   * @returns The id of the page that becomes active, or null when none is active.
   */
  deletePage(id: string) {
    const next = this.closePage(id);
    this.#disposePageCollection(id);
    this.pagesCollection.remove(id);
    return next;
  }

  /**
   * Adds a new element to the insertion target of the active page.
   * @param kind - Element kind to create.
   * @param [options] - Optional tag, component, attributes, properties, and style.
   * @returns The new element id, or null when no collection is active or the parent is invalid.
   */
  addElement(
    kind: ElementKind,
    options: {
      tag?: string | null;
      baseComponent?: string | null;
      referencedComponentId?: string | null;
      name?: string;
      attributes?: ElementAttributes;
      properties?: ElementProperties;
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
    const componentDefinition =
      kind === "user-component"
        ? this.userComponents.find((item) => item.component.id === options.referencedComponentId)
        : undefined;
    const componentProperties = { ...(componentDefinition?.component.properties ?? {}) };
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
      attributes: { ...defaults.attributes, ...options.attributes },
      properties: {
        ...defaults.properties,
        ...componentProperties,
        ...options.properties,
      },
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

  /**
   * Removes a single element and drops it from the selection.
   * @param id - Element id to remove.
   */
  removeElement(id: string) {
    this.elementsCollection?.remove(id);
    this.setElementSelection(this.selectedElementIds.filter((selectedId) => selectedId !== id));
  }

  /**
   * Removes every currently selected element.
   */
  removeSelectedElements() {
    const ids = [...this.selectedElementIds];
    if (ids.length === 0) return;
    this.elementsCollection?.removeMany(ids);
    this.clearElementSelection();
  }

  /**
   * Captures the current editor focus state.
   * @param [path] - Route path to record (defaults to the last tracked path).
   * @returns A snapshot of the current focus.
   */
  snapshotFocus(path: string = this.#lastFocus.path): EditorFocusSnapshot {
    return {
      projectId: this.activeProjectId,
      pageId: this.activePageId,
      selectedElementIds: [...this.selectedElementIds],
      tagSelectionIds: [...this.tagSelectionIds],
      leftPanelTab: this.leftPanelTab,
      path,
    };
  }

  /**
   * Records a focus change in the back/forward history.
   * @param path - Route path associated with the focus.
   */
  trackFocus(path: string) {
    const next = this.snapshotFocus(path);
    if (this.#suppressFocusRecord) {
      this.#lastFocus = next;
      return;
    }
    if (focusEquals(this.#lastFocus, next)) return;

    this.#focusHistory = [...this.#focusHistory, this.#lastFocus].slice(-MAX_FOCUS_HISTORY);
    this.#focusFuture = [];
    this.#lastFocus = next;
  }

  /**
   * Restores the previous focus snapshot from history.
   * @param currentPath - Current route path used for the forward entry.
   * @returns Ok with the restored path, or Err when applying the snapshot fails.
   */
  async backFocus(currentPath: string) {
    const target = this.#focusHistory.at(-1);
    if (!target) return ok(null);

    const current = this.snapshotFocus(currentPath);
    this.#suppressFocusRecord = true;
    const applied = await this.#applyFocus(target);
    if (applied.isErr()) {
      this.#suppressFocusRecord = false;
      return err(applied.error);
    }

    this.#focusHistory = this.#focusHistory.slice(0, -1);
    this.#focusFuture = [...this.#focusFuture, current];
    await tick();
    this.#lastFocus = this.snapshotFocus(target.path);
    this.#suppressFocusRecord = false;
    return ok({ path: target.path });
  }

  /**
   * Restores the next focus snapshot from the forward history.
   * @param currentPath - Current route path used for the back entry.
   * @returns Ok with the restored path, or Err when applying the snapshot fails.
   */
  async forwardFocus(currentPath: string) {
    const target = this.#focusFuture.at(-1);
    if (!target) return ok(null);

    const current = this.snapshotFocus(currentPath);
    this.#suppressFocusRecord = true;
    const applied = await this.#applyFocus(target);
    if (applied.isErr()) {
      this.#suppressFocusRecord = false;
      return err(applied.error);
    }

    this.#focusFuture = this.#focusFuture.slice(0, -1);
    this.#focusHistory = [...this.#focusHistory, current].slice(-MAX_FOCUS_HISTORY);
    await tick();
    this.#lastFocus = this.snapshotFocus(target.path);
    this.#suppressFocusRecord = false;
    return ok({ path: target.path });
  }

  /**
   * Tears down collections, active ids, selection, and focus history.
   */
  dispose() {
    this.#disposePageCollections();
    this.activeProjectId = null;
    this.activePageId = null;
    this.clearElementSelection();
    this.leftPanelTab = "tags";
    this.canvasZoom = 1;
    this.canvasPanX = 0;
    this.canvasPanY = 0;
    this.canvasViewResetToken++;
    this.#focusHistory = [];
    this.#focusFuture = [];
    this.#lastFocus = this.snapshotFocus();
  }

  /**
   * Applies a focus snapshot by opening its project and page and restoring selections.
   * @param snapshot - Focus state to restore.
   * @returns Ok when applied, or Err when the project cannot be opened.
   */
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

  /**
   * Creates a page element collection wired to undo history and live patches.
   * @param pageId - Page that owns the collection.
   * @param initial - Initial element records keyed by id.
   * @returns The new patch collection.
   */
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

  /**
   * Returns the collection for a page, creating it when missing.
   * @param pageId - Page id to resolve.
   * @param [initial] - Initial elements used when creating the collection (defaults to {}).
   * @returns The existing or newly created collection.
   */
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

  /**
   * Disposes a single page collection and clears its undo history.
   * @param pageId - Page id whose collection should be disposed.
   */
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

  /**
   * Disposes every page collection and clears undo history.
   */
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

  /**
   * Restores the open page ids from local storage when running in the browser.
   */
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

  /**
   * Persists the open page ids to local storage when running in the browser.
   */
  #persistOpenPages() {
    if (!browser) return;
    attempt(() => localStorage.setItem(OPEN_PAGES_KEY, JSON.stringify(this.openPageIds)));
  }
}
