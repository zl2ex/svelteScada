import { and, eq, isNotNull } from "drizzle-orm";
import { err, ok } from "neverthrow";
import { db } from "$lib/server/sqlite/db";
import { logger } from "$lib/server/pino/logger";
import { elements, pages, user_components, type ElementSelect } from "$lib/sqlite/tables";
import type { ElementOwner, ElementRecord } from "$lib/page/elementTypes";
import { elementContainerTypeError, elementParentError } from "$lib/page/elementTypes";
import {
  elementClosureTable,
  elementOwnerScope,
} from "$lib/server/sqlite/util/elementClosureTable";
import {
  normalizeBindings,
  parseElementWrite,
  validateElementAttributes,
  validateElementKindPayload,
} from "$lib/page/elementValidation";
import { attempt } from "$lib/util/attempt";
import { errorToString, type NeverThrowError } from "$lib/util/neverThrow";

function toElementRecord(
  row: ElementSelect & { parentId: string | null; path?: string },
): ElementRecord {
  const { pageId: _pageId, userComponentId: _userComponentId, path: _path, ...record } = row;
  return record;
}

function ownerWhere(owner: ElementOwner) {
  return owner.type === "page"
    ? eq(elements.pageId, owner.pageId)
    : eq(elements.userComponentId, owner.userComponentId);
}

function dbError(error: unknown, cause: string) {
  return err({
    reason: "DB_ERROR",
    cause: `${cause}: ${errorToString(error)}`,
  } as const satisfies NeverThrowError);
}

export class ElementManager {
  getProjectId(owner: ElementOwner) {
    const result = attempt(() =>
      owner.type === "page"
        ? db
            .select({ projectId: pages.projectId })
            .from(pages)
            .where(eq(pages.id, owner.pageId))
            .get()
        : db
            .select({ projectId: user_components.projectId })
            .from(user_components)
            .where(eq(user_components.id, owner.userComponentId))
            .get(),
    );
    if (result.isErr) return dbError(result.error, "getProjectId() failed");
    if (!result.data) {
      return err({
        reason: "OWNER_NOT_FOUND",
        cause:
          owner.type === "page"
            ? `page ${owner.pageId} does not exist`
            : `user component ${owner.userComponentId} does not exist`,
      } as const satisfies NeverThrowError);
    }
    return ok(result.data.projectId);
  }

  list(owner: ElementOwner) {
    const result = elementClosureTable.getAll(elementOwnerScope(owner));
    if (result.isErr()) return err(result.error);

    const map: Record<string, ElementRecord> = {};
    for (const row of result.value) map[row.id] = toElementRecord(row);
    return ok(map);
  }

  listForProject(projectId: string) {
    const pageRows = attempt(() =>
      db.select({ id: pages.id }).from(pages).where(eq(pages.projectId, projectId)).all(),
    );
    if (pageRows.isErr) return dbError(pageRows.error, "listForProject() page lookup failed");

    const pageIds = new Set(pageRows.data.map((page) => page.id));
    const elementsByPage: Record<string, Record<string, ElementRecord>> = {};
    for (const pageId of pageIds) elementsByPage[pageId] = {};

    const rows = elementClosureTable.getAll();
    if (rows.isErr()) return err(rows.error);

    for (const row of rows.value) {
      if (row.pageId && pageIds.has(row.pageId)) {
        elementsByPage[row.pageId][row.id] = toElementRecord(row);
      }
    }

    return ok(elementsByPage);
  }

  get(owner: ElementOwner, id: string) {
    const result = elementClosureTable.get(id, elementOwnerScope(owner));
    if (result.isErr()) {
      if (result.error.reason !== "NODE_NOT_FOUND") return err(result.error);
      return err({
        reason: "ELEMENT_NOT_FOUND",
        cause: `element ${id} does not belong to the requested owner`,
      } as const satisfies NeverThrowError);
    }
    return ok(toElementRecord(result.value));
  }

  create(owner: ElementOwner, input: ElementRecord) {
    const ownerProject = this.getProjectId(owner);
    if (ownerProject.isErr()) return err(ownerProject.error);

    const parsed = parseElementWrite(input);
    if (!parsed.success) {
      return err({
        reason: "INVALID_ELEMENT",
        cause: parsed.error.message,
      } as const satisfies NeverThrowError);
    }

    const payloadError = validateElementKindPayload(parsed.data);
    if (payloadError) {
      return err({
        reason: "INVALID_ELEMENT",
        cause: payloadError,
      } as const satisfies NeverThrowError);
    }

    const attributeError = validateElementAttributes(parsed.data.attributes);
    if (attributeError) {
      return err({
        reason: "INVALID_ELEMENT",
        cause: attributeError,
      } as const satisfies NeverThrowError);
    }

    const containerError = elementContainerTypeError(parsed.data);
    if (containerError) {
      return err({
        reason: "INVALID_CONTAINER_TYPE",
        cause: containerError,
      } as const satisfies NeverThrowError);
    }

    const parent = this.#validateParent(owner, parsed.data);
    if (parent.isErr()) return err(parent.error);

    const reference = this.#validateReference(
      owner,
      ownerProject.value,
      parsed.data.id,
      parsed.data.referencedComponentId,
    );
    if (reference.isErr()) return err(reference.error);

    const existing = attempt(() =>
      db.select({ id: elements.id }).from(elements).where(eq(elements.id, parsed.data.id)).get(),
    );
    if (existing.isErr) return dbError(existing.error, "create() id lookup failed");
    if (existing.data) {
      return err({
        reason: "ELEMENT_ALREADY_EXISTS",
        cause: `element ${parsed.data.id} already exists`,
      } as const satisfies NeverThrowError);
    }

    const now = Date.now();
    const { parentId, ...elementData } = parsed.data;
    const inserted = elementClosureTable.add({
      ...elementData,
      bindings: normalizeBindings(parsed.data.kind, parsed.data.bindings),
      ...(owner.type === "page"
        ? { pageId: owner.pageId, userComponentId: null }
        : { pageId: null, userComponentId: owner.userComponentId }),
      createdAt: now,
      updatedAt: now,
      parentId,
    });
    if (inserted.isErr()) return err(inserted.error);

    logger.info(`[ElementManager] created ${parsed.data.kind} element ${parsed.data.id}`);
    return ok(toElementRecord(inserted.value));
  }

  replace(owner: ElementOwner, id: string, input: ElementRecord) {
    const existing = this.get(owner, id);
    if (existing.isErr()) return err(existing.error);

    const ownerProject = this.getProjectId(owner);
    if (ownerProject.isErr()) return err(ownerProject.error);

    const parsed = parseElementWrite({ ...input, id });
    if (!parsed.success) {
      return err({
        reason: "INVALID_ELEMENT",
        cause: parsed.error.message,
      } as const satisfies NeverThrowError);
    }

    if (parsed.data.id !== id) {
      return err({
        reason: "INVALID_ELEMENT",
        cause: "element id cannot be changed",
      } as const satisfies NeverThrowError);
    }

    const payloadError = validateElementKindPayload(parsed.data);
    if (payloadError) {
      return err({
        reason: "INVALID_ELEMENT",
        cause: payloadError,
      } as const satisfies NeverThrowError);
    }

    const attributeError = validateElementAttributes(parsed.data.attributes);
    if (attributeError) {
      return err({
        reason: "INVALID_ELEMENT",
        cause: attributeError,
      } as const satisfies NeverThrowError);
    }

    const containerError = elementContainerTypeError(parsed.data);
    if (containerError) {
      return err({
        reason: "INVALID_CONTAINER_TYPE",
        cause: containerError,
      } as const satisfies NeverThrowError);
    }

    const parent = this.#validateParent(owner, parsed.data);
    if (parent.isErr()) return err(parent.error);

    const children = this.#validateChildren(owner, parsed.data);
    if (children.isErr()) return err(children.error);

    const reference = this.#validateReference(
      owner,
      ownerProject.value,
      id,
      parsed.data.referencedComponentId,
    );
    if (reference.isErr()) return err(reference.error);

    const parentChanged = parsed.data.parentId !== existing.value.parentId;
    if (parentChanged) {
      const moved = elementClosureTable.move(id, parsed.data.parentId ?? undefined);
      if (moved.isErr()) return err(moved.error);
      if (!moved.value) {
        return err({
          reason: "INVALID_ELEMENT_PARENT",
          cause: `element ${id} could not be moved to parent ${parsed.data.parentId}`,
        } as const satisfies NeverThrowError);
      }
    }

    const updated = attempt(() =>
      db
        .update(elements)
        .set({
          sortIndex: parsed.data.sortIndex,
          kind: parsed.data.kind,
          tag: parsed.data.tag,
          baseComponent: parsed.data.baseComponent,
          referencedComponentId: parsed.data.referencedComponentId,
          name: parsed.data.name,
          text: parsed.data.text,
          containerType: parsed.data.containerType,
          attributes: parsed.data.attributes,
          bindings: normalizeBindings(parsed.data.kind, parsed.data.bindings),
          updatedAt: Date.now(),
        })
        .where(and(eq(elements.id, id), ownerWhere(owner)))
        .returning()
        .get(),
    );
    if (updated.isErr || !updated.data) {
      if (parentChanged) {
        elementClosureTable.move(id, existing.value.parentId ?? undefined);
      }
      if (updated.isErr) return dbError(updated.error, "replace() update failed");
      return err({
        reason: "ELEMENT_NOT_FOUND",
        cause: `element ${id} does not belong to the requested owner`,
      } as const satisfies NeverThrowError);
    }

    logger.info(`[ElementManager] replaced element ${id}`);
    return ok(toElementRecord({ ...updated.data, parentId: parsed.data.parentId }));
  }

  remove(owner: ElementOwner, id: string) {
    const existing = this.get(owner, id);
    if (existing.isErr()) return err(existing.error);

    const removed = elementClosureTable.deleteRecursive(id);
    if (removed.isErr()) return err(removed.error);

    logger.info(
      `[ElementManager] removed element ${id} and ${removed.value.length - 1} descendants`,
    );
    return ok({ id, ids: removed.value });
  }

  #validateParent(
    owner: ElementOwner,
    element: Pick<ElementRecord, "id" | "parentId" | "kind" | "tag" | "containerType">,
  ) {
    const { id, parentId } = element;
    if (parentId === null) {
      const hierarchyError = elementParentError(element, null);
      if (hierarchyError) {
        return err({
          reason: "INVALID_ELEMENT_PARENT",
          cause: hierarchyError,
        } as const satisfies NeverThrowError);
      }
      return ok(null);
    }

    if (parentId === id) {
      return err({
        reason: "INVALID_ELEMENT_PARENT",
        cause: "an element cannot be its own parent",
      } as const satisfies NeverThrowError);
    }

    const rows = elementClosureTable.getAll(elementOwnerScope(owner));
    if (rows.isErr()) return err(rows.error);

    const byId = new Map(rows.value.map((row) => [row.id, row]));
    const parent = byId.get(parentId);
    if (!parent) {
      return err({
        reason: "ELEMENT_PARENT_NOT_FOUND",
        cause: `parent element ${parentId} does not exist for this owner`,
      } as const satisfies NeverThrowError);
    }

    const hierarchyError = elementParentError(element, parent);
    if (hierarchyError) {
      return err({
        reason: "INVALID_ELEMENT_PARENT",
        cause: hierarchyError,
      } as const satisfies NeverThrowError);
    }

    const seen = new Set<string>();
    let current: typeof parent | undefined = parent;
    while (current) {
      if (current.id === id) {
        return err({
          reason: "INVALID_ELEMENT_PARENT",
          cause: "an element cannot be moved below one of its descendants",
        } as const satisfies NeverThrowError);
      }
      if (seen.has(current.id)) break;
      seen.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }

    return ok(parentId);
  }

  #validateChildren(
    owner: ElementOwner,
    element: Pick<ElementRecord, "id" | "kind" | "tag" | "containerType">,
  ) {
    const rows = elementClosureTable.getAll(elementOwnerScope(owner));
    if (rows.isErr()) return err(rows.error);

    const children = rows.value.filter((row) => row.parentId === element.id);
    for (const child of children) {
      const hierarchyError = elementParentError(child, element);
      if (hierarchyError) {
        return err({
          reason: "INVALID_ELEMENT_CHILDREN",
          cause: hierarchyError,
        } as const satisfies NeverThrowError);
      }
    }

    return ok(null);
  }

  #validateReference(
    owner: ElementOwner,
    projectId: string,
    elementId: string,
    referencedComponentId: string | null,
  ) {
    if (!referencedComponentId) return ok(null);

    const component = attempt(() =>
      db.select().from(user_components).where(eq(user_components.id, referencedComponentId)).get(),
    );
    if (component.isErr) {
      return dbError(component.error, "validateReference() lookup failed");
    }
    if (!component.data) {
      return err({
        reason: "USER_COMPONENT_NOT_FOUND",
        cause: `user component ${referencedComponentId} does not exist`,
      } as const satisfies NeverThrowError);
    }
    if (component.data.projectId !== projectId) {
      return err({
        reason: "USER_COMPONENT_WRONG_PROJECT",
        cause: "pages and components may only reference components in their project",
      } as const satisfies NeverThrowError);
    }

    if (owner.type !== "userComponent") return ok(null);

    if (referencedComponentId === owner.userComponentId) {
      return err({
        reason: "COMPONENT_CYCLE",
        cause: "a user component cannot reference itself",
      } as const satisfies NeverThrowError);
    }

    const rows = attempt(() =>
      db
        .select({
          id: elements.id,
          ownerId: elements.userComponentId,
          referencedComponentId: elements.referencedComponentId,
        })
        .from(elements)
        .where(
          and(
            isNotNull(elements.userComponentId),
            eq(elements.kind, "user-component"),
            isNotNull(elements.referencedComponentId),
          ),
        )
        .all(),
    );
    if (rows.isErr) return dbError(rows.error, "validateReference() graph failed");

    const graph = new Map<string, Set<string>>();
    for (const row of rows.data) {
      if (!row.ownerId || !row.referencedComponentId) continue;
      if (row.id === elementId) continue;
      const edges = graph.get(row.ownerId) ?? new Set<string>();
      edges.add(row.referencedComponentId);
      graph.set(row.ownerId, edges);
    }

    const stack = [referencedComponentId];
    const seen = new Set<string>();
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === owner.userComponentId) {
        return err({
          reason: "COMPONENT_CYCLE",
          cause: "this reference would create a user component cycle",
        } as const satisfies NeverThrowError);
      }
      if (seen.has(current)) continue;
      seen.add(current);
      for (const next of graph.get(current) ?? []) stack.push(next);
    }

    return ok(null);
  }
}

export const pageElementManager = new ElementManager();
