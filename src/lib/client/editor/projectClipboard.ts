import { err, ok } from "neverthrow";
import { z } from "zod";
import type { ElementRecord } from "$lib/elements/elementTypes";
import { elementParentError } from "$lib/elements/elementTypes";
import {
  validateElementAttributes,
  validateElementKindPayload,
  validateElementStyle,
  z_ElementWrite,
} from "$lib/elements/elementValidation";
import type { PageRecord } from "$lib/elements/pageTypes";
import {
  z_ElementInsert,
  z_PageInsert,
  z_ProjectInsert,
  type ProjectSelect,
} from "$lib/sqlite/tables";
import { attempt } from "$lib/util/attempt";
import { errorToString, type NeverThrowError } from "$lib/util/neverThrow";
import { newId } from "$lib/util/newId";

const MAX_ROUTE_NAME_LENGTH = 64;

export const z_ClipboardElement = z_ElementWrite.extend({
  createdAt: z_ElementInsert.shape.createdAt,
  updatedAt: z_ElementInsert.shape.updatedAt,
});

export const z_ClipboardPage = z_PageInsert.extend({
  id: z.string().min(1),
});

export const z_ClipboardProject = z_ProjectInsert.extend({
  id: z.string().min(1),
});

export const z_ClipboardPageGroup = z.object({
  page: z_ClipboardPage,
  elements: z.array(z_ClipboardElement),
});

export const z_ClipboardElementItem = z.object({
  type: z.literal("element"),
  rootId: z.string().min(1),
  elements: z.array(z_ClipboardElement),
});

export const z_ClipboardPageItem = z.object({
  type: z.literal("page"),
  page: z_ClipboardPage,
  elements: z.array(z_ClipboardElement),
});

export const z_ClipboardProjectItem = z.object({
  type: z.literal("project"),
  project: z_ClipboardProject,
  pages: z.array(z_ClipboardPageGroup),
});

export const z_ProjectClipboardItem = z.discriminatedUnion("type", [
  z_ClipboardElementItem,
  z_ClipboardPageItem,
  z_ClipboardProjectItem,
]);

export const z_ProjectClipboard = z.array(z_ProjectClipboardItem).min(1);

export type ClipboardElementInput = z.input<typeof z_ClipboardElement>;
export type ClipboardPageInput = z.input<typeof z_ClipboardPage>;
export type ClipboardProjectInput = z.input<typeof z_ClipboardProject>;
export type ClipboardElement = z.output<typeof z_ClipboardElement>;
export type ClipboardPage = z.output<typeof z_ClipboardPage>;
export type ClipboardProject = z.output<typeof z_ClipboardProject>;
export type ClipboardPageGroup = z.output<typeof z_ClipboardPageGroup>;
export type ClipboardPageGroupInput = z.input<typeof z_ClipboardPageGroup>;
export type ElementClipboardItem = z.output<typeof z_ClipboardElementItem>;
export type ElementClipboardItemInput = z.input<typeof z_ClipboardElementItem>;
export type PageClipboardItem = z.output<typeof z_ClipboardPageItem>;
export type PageClipboardItemInput = z.input<typeof z_ClipboardPageItem>;
export type ClipboardProjectItem = z.output<typeof z_ClipboardProjectItem>;
export type ClipboardProjectItemInput = z.input<typeof z_ClipboardProjectItem>;
export type ProjectClipboardItem = z.output<typeof z_ProjectClipboardItem>;
export type ProjectClipboardItemInput = z.input<typeof z_ProjectClipboardItem>;
export type ProjectClipboard = z.output<typeof z_ProjectClipboard>;
export type ProjectClipboardInput = z.input<typeof z_ProjectClipboard>;

export type CopiedPage = {
  page: PageRecord;
  elements: ElementRecord[];
};

export type CopiedProject = {
  project: ProjectSelect;
  pages: CopiedPage[];
};

function clipboardError(reason: string, cause: string) {
  return err({ reason, cause } as const satisfies NeverThrowError);
}

function validateElementSemantics(element: ClipboardElement) {
  const payloadError = validateElementKindPayload(element);
  if (payloadError) return payloadError;

  const attributeError = validateElementAttributes(element.attributes);
  if (attributeError) return attributeError;

  return validateElementStyle(element.style);
}

function validateElementForest(elements: ClipboardElement[], rootId?: string) {
  const byId = new Map<string, ClipboardElement>();
  for (const element of elements) {
    if (byId.has(element.id)) {
      return `element id ${element.id} occurs more than once`;
    }
    byId.set(element.id, element);
  }

  if (rootId !== undefined) {
    const root = byId.get(rootId);
    if (!root) return `element root ${rootId} is missing`;
    if (root.parentId && byId.has(root.parentId)) {
      return `element root ${rootId} cannot have a pasted parent`;
    }
  }

  const childrenByParent = new Map<string, ClipboardElement[]>();
  const roots: ClipboardElement[] = [];
  for (const element of elements) {
    if (!element.parentId) {
      roots.push(element);
      continue;
    }
    if (rootId !== undefined && element.id === rootId) continue;
    if (!byId.has(element.parentId)) {
      return `element ${element.id} references missing parent ${element.parentId}`;
    }
    const children = childrenByParent.get(element.parentId) ?? [];
    children.push(element);
    childrenByParent.set(element.parentId, children);
  }

  if (rootId === undefined && elements.length > 0 && roots.length === 0) {
    return "pasted elements do not have a root";
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  function visit(id: string): string | null {
    if (visiting.has(id)) return `element tree contains a cycle at ${id}`;
    if (visited.has(id)) return null;

    visiting.add(id);
    for (const child of childrenByParent.get(id) ?? []) {
      const error = visit(child.id);
      if (error) return error;
    }
    visiting.delete(id);
    visited.add(id);
    return null;
  }

  const rootsToVisit = rootId === undefined ? roots : [byId.get(rootId)!];
  for (const root of rootsToVisit) {
    const error = visit(root.id);
    if (error) return error;
  }

  if (visited.size !== elements.length) {
    return "pasted elements are not all connected to a root";
  }

  for (const element of elements) {
    if (rootId !== undefined && element.id === rootId) continue;
    const parent = element.parentId ? (byId.get(element.parentId) ?? null) : null;
    const parentError = elementParentError(
      element as ElementRecord,
      parent as ElementRecord | null,
    );
    if (parentError) return parentError;
  }

  return null;
}

function validatePageGroup(group: ClipboardPageGroup) {
  const forestError = validateElementForest(group.elements);
  if (forestError) return forestError;

  for (const element of group.elements) {
    const semanticsError = validateElementSemantics(element);
    if (semanticsError) return semanticsError;
  }

  return null;
}

function validateProjectItem(item: ClipboardProjectItem) {
  const pageIds = new Set<string>();
  const elementIds = new Set<string>();

  for (const group of item.pages) {
    if (pageIds.has(group.page.id)) {
      return `page id ${group.page.id} occurs more than once`;
    }
    pageIds.add(group.page.id);

    if (group.page.projectId !== item.project.id) {
      return `page ${group.page.id} does not belong to project ${item.project.id}`;
    }

    for (const element of group.elements) {
      if (elementIds.has(element.id)) {
        return `element id ${element.id} occurs more than once`;
      }
      elementIds.add(element.id);
    }

    const groupError = validatePageGroup(group);
    if (groupError) return groupError;
  }

  return null;
}

/**
 * Parses and validates a project clipboard payload.
 * @param text Raw clipboard text.
 * @returns A neverthrow result containing the validated clipboard item list.
 */
export function parseProjectClipboard(text: string) {
  const parsedJson = attempt(() => JSON.parse(text) as unknown);
  if (parsedJson.isErr) {
    return clipboardError("PASTE_INVALID_JSON", errorToString(parsedJson.error));
  }

  const parsed = z_ProjectClipboard.safeParse(parsedJson.data);
  if (!parsed.success) {
    return clipboardError("PASTE_INVALID_CLIPBOARD", parsed.error.message);
  }

  for (const item of parsed.data) {
    if (item.type === "element") {
      const root = item.elements.find((element) => element.id === item.rootId);
      if (!root) return clipboardError("PASTE_INVALID_CLIPBOARD", "element root is missing");

      const forestError = validateElementForest(item.elements, item.rootId);
      if (forestError) return clipboardError("PASTE_INVALID_CLIPBOARD", forestError);

      for (const element of item.elements) {
        const semanticsError = validateElementSemantics(element);
        if (semanticsError) return clipboardError("PASTE_INVALID_CLIPBOARD", semanticsError);
      }
    } else if (item.type === "page") {
      const pageError = validatePageGroup({ page: item.page, elements: item.elements });
      if (pageError) return clipboardError("PASTE_INVALID_CLIPBOARD", pageError);
    } else {
      const projectError = validateProjectItem(item);
      if (projectError) return clipboardError("PASTE_INVALID_CLIPBOARD", projectError);
    }
  }

  return ok(parsed.data);
}

/**
 * Collects an element and all of its descendants from a page element map.
 * @param elements Element map keyed by element id.
 * @param rootId Element subtree root.
 * @returns The root element and its descendants.
 */
export function collectElementSubtree(elements: Record<string, ElementRecord>, rootId: string) {
  const root = elements[rootId];
  if (!root) return [];

  const result: ElementRecord[] = [];
  const visit = (element: ElementRecord) => {
    result.push(element);
    for (const child of Object.values(elements)
      .filter((candidate) => candidate.parentId === element.id)
      .sort((a, b) => a.sortIndex - b.sortIndex || a.name.localeCompare(b.name))) {
      visit(child);
    }
  };
  visit(root);
  return result;
}

/**
 * Converts an element record into its clipboard representation without timestamps.
 * @param element Element record to copy.
 * @returns Clipboard-safe element data.
 */
export function toClipboardElement(element: ElementRecord): ClipboardElementInput {
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = element;
  return rest;
}

/**
 * Converts a page record into its clipboard representation without timestamps.
 * @param page Page record to copy.
 * @returns Clipboard-safe page data.
 */
export function toClipboardPage(page: PageRecord): ClipboardPageInput {
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = page;
  return rest;
}

/**
 * Converts a project record into its clipboard representation without timestamps.
 * @param project Project record to copy.
 * @returns Clipboard-safe project data.
 */
export function toClipboardProject(project: ProjectSelect): ClipboardProjectInput {
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = project;
  return rest;
}

function routeNameIsValid(name: string) {
  return z_PageInsert.shape.name.safeParse(name).success;
}

/**
 * Generates a unique route-safe name by appending copy suffixes when needed.
 * @param name Desired route name.
 * @param existing Existing route names.
 * @returns A unique route name no longer than 64 characters.
 */
export function uniqueRouteName(name: string, existing: Iterable<string>) {
  const used = new Set(existing);
  if (!used.has(name) && routeNameIsValid(name)) return name;

  const base = name.replace(/-copy(?:-\d+)?$/, "");
  let index = 1;
  while (true) {
    const suffix = index === 1 ? "-copy" : `-copy-${index}`;
    const prefixLength = MAX_ROUTE_NAME_LENGTH - suffix.length;
    const prefix = base.slice(0, Math.max(1, prefixLength)).replace(/-+$/, "") || "copy";
    const candidate = `${prefix}${suffix}`;
    if (!used.has(candidate) && routeNameIsValid(candidate)) return candidate;
    index++;
  }
}

/**
 * Remaps a validated element forest to new ids and parents.
 * @param elements Clipboard element records.
 * @param options Root remapping and sort-index options.
 * @returns Full element records ready for insertion.
 */
export function remapElementForest(
  elements: ClipboardElement[],
  options: {
    rootId?: string;
    targetParentId?: string | null;
    targetSortIndex?: number;
    now?: number;
  } = {},
): ElementRecord[] {
  const now = options.now ?? Date.now();
  const idMap = new Map(elements.map((element) => [element.id, newId()]));
  const parentById = new Map<string, string | null>();

  for (const element of elements) {
    let parentId: string | null = null;
    if (options.rootId !== undefined && element.id === options.rootId) {
      parentId = options.targetParentId ?? null;
    } else if (element.parentId) {
      parentId = idMap.get(element.parentId) ?? null;
    }
    parentById.set(element.id, parentId);
  }

  const siblingsByParent = new Map<string | null, ClipboardElement[]>();
  for (const element of elements) {
    const parentId = parentById.get(element.id) ?? null;
    const siblings = siblingsByParent.get(parentId) ?? [];
    siblings.push(element);
    siblingsByParent.set(parentId, siblings);
  }

  const sortIndexById = new Map<string, number>();
  for (const [parentId, siblings] of siblingsByParent) {
    const sorted = [...siblings].sort(
      (a, b) =>
        a.sortIndex - b.sortIndex || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
    );
    const start =
      parentId !== null && parentId === options.targetParentId ? (options.targetSortIndex ?? 0) : 0;
    sorted.forEach((element, index) => sortIndexById.set(element.id, start + index));
  }

  return elements.map(
    (element) =>
      ({
        ...element,
        id: idMap.get(element.id)!,
        parentId: parentById.get(element.id) ?? null,
        sortIndex: sortIndexById.get(element.id) ?? 0,
        createdAt: element.createdAt ?? now,
        updatedAt: element.updatedAt ?? now,
      }) as ElementRecord,
  );
}

/**
 * Builds a copied element subtree for insertion under a new parent.
 * @param item Validated element clipboard item.
 * @param targetParentId Parent element id, or null for the page root.
 * @param targetSortIndex First sort index to assign under the target parent.
 * @param now Timestamp fallback for records missing timestamps.
 * @returns New element records with remapped ids and parents.
 */
export function createElementCopy(
  item: ElementClipboardItem,
  targetParentId: string | null,
  targetSortIndex: number,
  now = Date.now(),
) {
  return remapElementForest(item.elements, {
    rootId: item.rootId,
    targetParentId,
    targetSortIndex,
    now,
  });
}

/**
 * Builds a copied page with all of its elements for a target project.
 * @param item Validated page clipboard item.
 * @param targetProjectId Project that will own the new page.
 * @param existingPages Existing pages in the target project.
 * @param now Timestamp fallback for records missing timestamps.
 * @returns A new page and its remapped elements.
 */
export function createPageCopy(
  item: PageClipboardItem,
  targetProjectId: string,
  existingPages: PageRecord[],
  now = Date.now(),
): CopiedPage {
  const name = uniqueRouteName(
    item.page.name,
    existingPages.map((page) => page.name),
  );
  const sortIndex = Math.max(-1, ...existingPages.map((page) => page.sortIndex)) + 1;
  const page: PageRecord = {
    id: newId(),
    projectId: targetProjectId,
    name,
    sortIndex,
    createdAt: item.page.createdAt ?? now,
    updatedAt: item.page.updatedAt ?? now,
  };

  return {
    page,
    elements: remapElementForest(item.elements, { now }),
  };
}

/**
 * Builds a copied project with all pages and elements.
 * @param item Validated project clipboard item.
 * @param existingProjects Existing projects used for unique naming.
 * @param now Timestamp fallback for records missing timestamps.
 * @returns A new project, its pages, and each page's remapped elements.
 */
export function createProjectCopy(
  item: ClipboardProjectItem,
  existingProjects: ProjectSelect[],
  now = Date.now(),
): CopiedProject {
  const projectId = newId();
  const project: ProjectSelect = {
    id: projectId,
    name: uniqueRouteName(
      item.project.name,
      existingProjects.map((project) => project.name),
    ),
    version: item.project.version ?? "0.0.0",
    description: item.project.description ?? null,
    themeId: item.project.themeId ?? null,
    grid_enabled: item.project.grid_enabled ?? true,
    grid_spacing: item.project.grid_spacing ?? 5,
    createdAt: item.project.createdAt ?? now,
    updatedAt: item.project.updatedAt ?? now,
  };

  const pageNames = new Set<string>();
  const groups = [...item.pages].sort(
    (a, b) =>
      (a.page.sortIndex ?? 0) - (b.page.sortIndex ?? 0) ||
      a.page.name.localeCompare(b.page.name) ||
      a.page.id.localeCompare(b.page.id),
  );

  const pages = groups.map((group, index): CopiedPage => {
    const name = uniqueRouteName(group.page.name, pageNames);
    pageNames.add(name);
    return {
      page: {
        id: newId(),
        projectId,
        name,
        sortIndex: index,
        createdAt: group.page.createdAt ?? now,
        updatedAt: group.page.updatedAt ?? now,
      },
      elements: remapElementForest(group.elements, { now }),
    };
  });

  return { project, pages };
}

/**
 * Returns the next sort index for a new child under a parent page.
 * @param elements Existing elements in the page.
 * @param parentId Parent element id, or null for the page root.
 * @returns The next available sort index.
 */
export function nextElementSortIndex(
  elements: Record<string, ElementRecord> | undefined,
  parentId: string | null,
) {
  return (
    Math.max(
      -1,
      ...Object.values(elements ?? {})
        .filter((element) => element.parentId === parentId)
        .map((element) => element.sortIndex),
    ) + 1
  );
}
