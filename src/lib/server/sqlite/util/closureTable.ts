import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { err, ok } from "neverthrow";
import { attempt } from "$lib/util/attempt";
import { errorToString, type NeverThrowError } from "$lib/util/neverThrow";

export type ClosureItem = {
  id: string;
  name: string;
};

export type ClosureTableNode<T extends ClosureItem = ClosureItem> = T & {
  parentId: string | null;
};

export type ClosureTableNodeWithPath<T extends ClosureItem = ClosureItem> = ClosureTableNode<T> & {
  path: string;
};

type TableLike = any;

export type ClosureTableOptions<TItem extends ClosureItem> = {
  items: TableLike;
  paths: TableLike;
  pathField?: keyof TItem & string;
  scopeKey?: (item: TItem) => string | null;
  onCascadeDelete?: (tx: any, ids: string[]) => void;
};

export class ClosureTable<
  TItem extends ClosureItem,
  TPath extends { parent: string; child: string; depth: number },
> {
  #items: TableLike;
  #paths: TableLike;
  #pathField: keyof TItem & string;
  #scopeKey?: (item: TItem) => string | null;
  #onCascadeDelete?: (tx: any, ids: string[]) => void;

  constructor(options: ClosureTableOptions<TItem>) {
    this.#items = options.items;
    this.#paths = options.paths;
    this.#pathField = options.pathField ?? ("name" as keyof TItem & string);
    this.#scopeKey = options.scopeKey;
    this.#onCascadeDelete = options.onCascadeDelete;
  }

  add(node: ClosureTableNode<TItem>) {
    const result = attempt(() =>
      db.transaction((tx: any): any => {
        const {
          parentId,
          path: _path,
          ...item
        } = node as ClosureTableNode<TItem> & {
          path?: string;
        };
        const rows = tx.insert(this.#items).values(item).returning().all() as any[];
        const row = rows[0];

        if (parentId === null) {
          tx.insert(this.#paths).values({ parent: row.id, child: row.id, depth: 0 }).run();
        } else {
          const parents = tx
            .select()
            .from(this.#paths)
            .where(eq(this.#paths.child, parentId))
            .all();

          tx.insert(this.#paths)
            .values([
              ...parents.map((path: TPath) => ({
                parent: path.parent,
                child: row.id,
                depth: path.depth + 1,
              })),
              { parent: row.id, child: row.id, depth: 0 },
            ])
            .run();
        }

        return {
          ...row,
          parentId,
        } as ClosureTableNode<TItem>;
      }),
    );

    if (result.error) {
      return err({
        reason: "DB_ERROR",
        cause: errorToString(result.error),
      } as const satisfies NeverThrowError);
    }

    return ok(result.data);
  }

  getBreadcrumbs(id: string) {
    const result = attempt(() => {
      const rows = db.select().from(this.#paths).where(eq(this.#paths.child, id)).all() as TPath[];

      const parentIds = [...new Set(rows.map((row) => row.parent))];
      if (parentIds.length === 0) return [];

      const nodes = db
        .select()
        .from(this.#items)
        .where(inArray(this.#items.id, parentIds))
        .all() as TItem[];

      const nameMap = new Map(nodes.map((node) => [node.id, node.name]));

      return rows
        .map((row) => ({
          id: row.parent,
          name: nameMap.get(row.parent) ?? "unknown",
          depth: row.depth,
        }))
        .sort((a, b) => a.depth - b.depth);
    });

    if (result.error) {
      return err({
        reason: "DB_ERROR",
        cause: errorToString(result.error),
      } as const satisfies NeverThrowError);
    }

    return ok(result.data);
  }

  getSubtree(id: string) {
    const result = attempt(() => {
      const rows = db.select().from(this.#paths).where(eq(this.#paths.parent, id)).all() as TPath[];

      const childIds = [...new Set(rows.map((row) => row.child))];
      if (childIds.length === 0) return [];

      const nodes = db
        .select()
        .from(this.#items)
        .where(inArray(this.#items.id, childIds))
        .all() as TItem[];

      const nameMap = new Map(nodes.map((node) => [node.id, node.name]));

      return rows
        .map((row) => ({
          id: row.child,
          name: nameMap.get(row.child) ?? "unknown",
          depth: row.depth,
        }))
        .sort((a, b) => a.depth - b.depth);
    });

    if (result.error) {
      return err({
        reason: "DB_ERROR",
        cause: errorToString(result.error),
      } as const satisfies NeverThrowError);
    }

    return ok(result.data);
  }

  move(id: string, newParentId: string | undefined) {
    const result = attempt(() =>
      db.transaction((tx: any): any => {
        const subtree = tx
          .select({ child: this.#paths.child, depth: this.#paths.depth })
          .from(this.#paths)
          .where(eq(this.#paths.parent, id))
          .all() as { child: string; depth: number }[];

        if (subtree.length === 0) return false;
        const subtreeIds = [...new Set(subtree.map((row) => row.child))];
        if (newParentId && subtreeIds.includes(newParentId)) return false;

        const scope = this.#scopeKey;
        if (scope && newParentId) {
          const current = tx
            .select()
            .from(this.#items)
            .where(eq(this.#items.id, id))
            .all() as TItem[];
          const parent = tx
            .select()
            .from(this.#items)
            .where(eq(this.#items.id, newParentId))
            .all() as TItem[];
          if (!current[0] || !parent[0] || scope(current[0]) !== scope(parent[0])) {
            return false;
          }
        }

        const depthMap = new Map(subtree.map((row) => [row.child, row.depth]));

        tx.delete(this.#paths).where(inArray(this.#paths.child, subtreeIds)).run();

        const newAncestors = newParentId
          ? (tx
              .select({ parent: this.#paths.parent, depth: this.#paths.depth })
              .from(this.#paths)
              .where(eq(this.#paths.child, newParentId))
              .all() as { parent: string; depth: number }[])
          : [];

        const values: { parent: string; child: string; depth: number }[] = [];

        for (const childId of subtreeIds) {
          values.push({ parent: childId, child: childId, depth: 0 });

          const relativeDepth = depthMap.get(childId)!;
          for (const ancestor of newAncestors) {
            values.push({
              parent: ancestor.parent,
              child: childId,
              depth: ancestor.depth + 1 + relativeDepth,
            });
          }
        }

        tx.insert(this.#paths).values(values).run();
        return true;
      }),
    );

    if (result.error) {
      return err({
        reason: "DB_ERROR",
        cause: errorToString(result.error),
      } as const satisfies NeverThrowError);
    }

    return ok(result.data);
  }

  rename(id: string, newName: string) {
    const result = attempt(() =>
      db.transaction((tx: any): any => {
        tx.update(this.#items)
          .set({ [this.#pathField]: newName })
          .where(eq(this.#items.id, id))
          .run();
      }),
    );

    if (result.error) {
      return err({
        reason: "DB_ERROR",
        cause: errorToString(result.error),
      } as const satisfies NeverThrowError);
    }

    return ok(result.data);
  }

  getAll(scopeValue?: string) {
    const result = attempt(() => {
      const allItems = db.select().from(this.#items).all() as TItem[];
      const scope = this.#scopeKey;
      const items =
        scope && scopeValue !== undefined
          ? allItems.filter((item) => scope(item) === scopeValue)
          : allItems;

      if (items.length === 0) return [];

      const nameById = new Map(allItems.map((item) => [item.id, String(item[this.#pathField])]));

      const depthOne = db
        .select({ child: this.#paths.child, parent: this.#paths.parent })
        .from(this.#paths)
        .where(eq(this.#paths.depth, 1))
        .all() as { child: string; parent: string }[];
      const parentByChild = new Map(depthOne.map((row) => [row.child, row.parent]));

      const pathById = new Map<string, string>();
      const pathOf = (id: string): string => {
        const cached = pathById.get(id);
        if (cached !== undefined) return cached;
        const name = nameById.get(id) ?? "unknown";
        const parent = parentByChild.get(id);
        const path = parent ? `${pathOf(parent)}/${name}` : `/${name}`;
        pathById.set(id, path);
        return path;
      };

      return items.map((item) => ({
        ...item,
        parentId: parentByChild.get(item.id) ?? null,
        path: pathOf(item.id),
      })) as ClosureTableNodeWithPath<TItem>[];
    });

    if (result.error) {
      return err({
        reason: "DB_ERROR",
        cause: errorToString(result.error),
      } as const satisfies NeverThrowError);
    }

    return ok(result.data);
  }

  get(id: string, scopeValue?: string) {
    const all = this.getAll(scopeValue);
    if (all.isErr()) return err(all.error);

    const node = all.value.find((item) => item.id === id);
    if (!node) {
      return err({
        reason: "NODE_NOT_FOUND",
        cause: `no node at id ${id}`,
      } as const satisfies NeverThrowError);
    }

    return ok(node);
  }

  deleteRecursive(id: string) {
    const result = attempt(() =>
      db.transaction((tx: any): any => {
        const children = tx
          .select({ id: this.#paths.child })
          .from(this.#paths)
          .where(eq(this.#paths.parent, id))
          .all() as { id: string }[];

        const ids = children.map((row) => row.id);
        if (ids.length === 0) return ids;

        this.#onCascadeDelete?.(tx, ids);
        tx.delete(this.#paths).where(inArray(this.#paths.child, ids)).run();
        tx.delete(this.#items).where(inArray(this.#items.id, ids)).run();
        return ids;
      }),
    );

    if (result.error) {
      return err({
        reason: "DB_ERROR",
        cause: errorToString(result.error),
      } as const satisfies NeverThrowError);
    }

    return ok(result.data);
  }
}
