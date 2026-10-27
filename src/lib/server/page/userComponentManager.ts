import { and, eq, isNotNull } from "drizzle-orm";
import { err, ok } from "neverthrow";
import { db } from "$lib/server/sqlite/db";
import { elements, user_components } from "$lib/sqlite/tables";
import type { ElementRecord } from "$lib/page/elementTypes";
import { pageElementManager } from "./pageElementManager";
import { elementClosureTable } from "$lib/server/sqlite/util/elementClosureTable";
import { attempt } from "$lib/util/attempt";
import { errorToString, type NeverThrowError } from "$lib/util/neverThrow";

export class UserComponentManager {
  getAll() {
    const result = attempt(() => db.select().from(user_components).all());
    if (result.isErr) {
      return err({
        reason: "DB_ERROR",
        cause: `getAll() failed: ${errorToString(result.error)}`,
      } as const satisfies NeverThrowError);
    }
    return ok(result.data);
  }

  getAllForProject(projectId: string) {
    const result = attempt(() =>
      db.select().from(user_components).where(eq(user_components.projectId, projectId)).all(),
    );
    if (result.isErr) {
      return err({
        reason: "DB_ERROR",
        cause: `getAllForProject() failed: ${errorToString(result.error)}`,
      } as const satisfies NeverThrowError);
    }
    return ok(result.data);
  }

  get(id: string) {
    const result = attempt(() =>
      db.select().from(user_components).where(eq(user_components.id, id)).get(),
    );
    if (result.isErr) {
      return err({
        reason: "DB_ERROR",
        cause: `get() failed: ${errorToString(result.error)}`,
      } as const satisfies NeverThrowError);
    }
    if (!result.data) {
      return err({
        reason: "USER_COMPONENT_NOT_FOUND",
        cause: `user component ${id} does not exist`,
      } as const satisfies NeverThrowError);
    }
    return ok(result.data);
  }

  getElements(id: string) {
    const component = this.get(id);
    if (component.isErr()) return err(component.error);
    return pageElementManager.list({ type: "userComponent", userComponentId: id });
  }

  getDefinitions() {
    const components = this.getAll();
    if (components.isErr()) return err(components.error);

    const rows = elementClosureTable.getAll();
    if (rows.isErr()) return err(rows.error);

    const elementsByComponent: Record<string, Record<string, ElementRecord>> = {};
    for (const row of rows.value) {
      if (!row.userComponentId) continue;
      const { pageId: _pageId, userComponentId: _userComponentId, path: _path, ...record } = row;
      const map = elementsByComponent[row.userComponentId] ?? {};
      map[row.id] = record;
      elementsByComponent[row.userComponentId] = map;
    }

    return ok(
      components.value.map((component) => ({
        component,
        elements: elementsByComponent[component.id] ?? {},
      })),
    );
  }

  hasCycle() {
    const rows = attempt(() =>
      db
        .select({
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
    if (rows.isErr) {
      return err({
        reason: "DB_ERROR",
        cause: `hasCycle() failed: ${errorToString(rows.error)}`,
      } as const satisfies NeverThrowError);
    }

    const graph = new Map<string, string[]>();
    for (const row of rows.data) {
      if (!row.ownerId || !row.referencedComponentId) continue;
      const edges = graph.get(row.ownerId) ?? [];
      edges.push(row.referencedComponentId);
      graph.set(row.ownerId, edges);
    }

    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string): boolean => {
      if (visiting.has(id)) return true;
      if (visited.has(id)) return false;
      visiting.add(id);
      for (const next of graph.get(id) ?? []) {
        if (visit(next)) return true;
      }
      visiting.delete(id);
      visited.add(id);
      return false;
    };

    for (const id of graph.keys()) {
      if (visit(id)) return ok(true);
    }
    return ok(false);
  }
}

export const userComponentManager = new UserComponentManager();
