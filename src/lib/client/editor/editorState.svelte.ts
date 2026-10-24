import { browser } from "$app/environment";
import type { PatchCollection } from "$lib/client/live/patchCollection.svelte";
import type { ProjectSelect, UserComponentSelect } from "$lib/sqlite/tables";
import type { ElementRecord, ElementKind } from "$lib/page/elementTypes";
import { elementParentError, findContainerInsertionTarget } from "$lib/page/elementTypes";
import { pagePath, pageRoute, sortedPages, type PageRecord } from "$lib/page/pageTypes";
import type { NeverThrowError } from "$lib/util/neverThrow";
import { attempt } from "$lib/util/attempt";
import { newId } from "$lib/util/newId";

const OPEN_PAGES_KEY = "editor-open-page-ids";

export type UserComponentDefinition = {
  component: UserComponentSelect;
  elements: Record<string, ElementRecord>;
};

export type EditorMode = "edit" | "preview";

export class EditorState {
  pages: PatchCollection<PageRecord, NeverThrowError>;
  projects = $state<ProjectSelect[]>([]);
  userComponents = $state<UserComponentDefinition[]>([]);
  activePageId = $state<string | null>(null);
  openPageIds = $state<string[]>([]);
  selectedElementId = $state<string | null>(null);
  mode = $state<EditorMode>("edit");
  elementCollection = $state.raw<PatchCollection<ElementRecord, NeverThrowError> | null>(null);

  constructor(options: {
    pages: PatchCollection<PageRecord, NeverThrowError>;
    projects: ProjectSelect[];
    userComponents: UserComponentDefinition[];
  }) {
    this.pages = options.pages;
    this.projects = options.projects;
    this.userComponents = options.userComponents;
    this.#loadOpenPages();
  }

  get activePage(): PageRecord | null {
    if (!this.activePageId) return null;
    return this.pages.state[this.activePageId] ?? null;
  }

  get elements(): Record<string, ElementRecord> {
    return this.elementCollection?.state ?? {};
  }

  get insertionTarget(): string | null {
    return findContainerInsertionTarget(this.elements, this.selectedElementId);
  }

  get insertionTargetElement(): ElementRecord | null {
    const id = this.insertionTarget;
    return id ? (this.elements[id] ?? null) : null;
  }

  pagePath(id: string) {
    return pagePath(this.pages.state, id);
  }

  route(id: string) {
    const page = this.pages.state[id];
    if (!page) return "/editor";
    const project = this.projects.find((item) => item.id === page.projectId);
    return pageRoute(this.pages.state, project?.name ?? "project", id);
  }

  projectForPage(page: PageRecord) {
    return this.projects.find((project) => project.id === page.projectId);
  }

  children(projectId?: string) {
    const pages = Object.fromEntries(
      Object.entries(this.pages.state).filter(
        ([, page]) => projectId === undefined || page.projectId === projectId,
      ),
    );
    return sortedPages(pages);
  }

  setActivePage(id: string | null) {
    this.activePageId = id;
    this.selectedElementId = null;
    if (id && !this.openPageIds.includes(id)) {
      this.openPageIds = [...this.openPageIds, id];
      this.#persistOpenPages();
    }
  }

  openPage(id: string) {
    if (!this.openPageIds.includes(id)) {
      this.openPageIds = [...this.openPageIds, id];
      this.#persistOpenPages();
    }
  }

  closePage(id: string) {
    this.openPageIds = this.openPageIds.filter((pageId) => pageId !== id);
    this.#persistOpenPages();
    if (this.activePageId !== id) return this.activePageId;
    return this.openPageIds.at(-1) ?? null;
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
    this.pages.add(page);
    this.openPage(page.id);
    return page.id;
  }

  renamePage(id: string, name: string) {
    this.pages.update(id, { name, updatedAt: Date.now() });
  }

  deletePage(id: string) {
    this.pages.remove(id);
    const next = this.closePage(id);
    return next;
  }

  setElements(collection: PatchCollection<ElementRecord, NeverThrowError> | null) {
    this.elementCollection = collection;
    this.selectedElementId = null;
  }

  clearElements(collection: PatchCollection<ElementRecord, NeverThrowError>) {
    if (this.elementCollection !== collection) return;
    this.elementCollection = null;
    this.selectedElementId = null;
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
    const collection = this.elementCollection;
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
    this.elementCollection?.remove(id);
    if (this.selectedElementId === id) this.selectedElementId = null;
  }

  #loadOpenPages() {
    if (!browser) return;
    const raw = attempt(() => localStorage.getItem(OPEN_PAGES_KEY));
    if (raw.error || !raw.data) return;
    const parsed = attempt(() => JSON.parse(raw.data!));
    if (parsed.error || !Array.isArray(parsed.data)) return;
    this.openPageIds = parsed.data.filter(
      (id): id is string => typeof id === "string" && Boolean(this.pages.state[id]),
    );
  }

  #persistOpenPages() {
    if (!browser) return;
    attempt(() => localStorage.setItem(OPEN_PAGES_KEY, JSON.stringify(this.openPageIds)));
  }
}
