import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { tag_folders, tag_folder_paths, tags, type TagFolderSelect } from "$lib/sqlite/tables";
import { err, ok } from "neverthrow";
import { attempt } from "$lib/util/attempt";
import { errorToString, type NeverThrowError } from "$lib/util/neverThrow";

export type ClosureTableNode = TagFolderSelect & {
  parentId: string | null;
};

// a folder plus its full path, built from the closure table. top level folders
// (parentId === null) start a path, eg "base" -> "/base", and children append,
// eg a child "test" of "base" -> "/base/test".
export type ClosureTableNodeWithPath = ClosureTableNode & { path: string };

export class ClosureTable {
  #items: typeof tag_folders;
  #paths: typeof tag_folder_paths;
  #tagTable?: typeof tags;

  constructor(items: typeof tag_folders, paths: typeof tag_folder_paths, tagTable?: typeof tags) {
    this.#items = items;
    this.#paths = paths;
    this.#tagTable = tagTable;
  }

  add(node: ClosureTableNode) {
    const result = attempt(() =>
      db.transaction((tx) => {
        const [folder] = tx
          .insert(this.#items)
          .values(node)
          // TD WIP fix conflict updates
          // .onConflictDoUpdate({
          //   target: this.#items.id,
          //   set: { name: node.name },
          // })
          .returning()
          .all();

        if (node.parentId === null) {
          tx.insert(this.#paths)
            .values({ parent: folder.id, child: folder.id, depth: 0 })
            //.onConflictDoNothing()
            .run();
        } else {
          const parents = tx
            .select()
            .from(this.#paths)
            .where(eq(this.#paths.child, node.parentId))
            .all();

          tx.insert(this.#paths)
            .values([
              ...parents.map((row) => ({
                parent: row.parent,
                child: folder.id,
                depth: row.depth + 1,
              })),
              { parent: folder.id, child: folder.id, depth: 0 },
            ])
            //.onConflictDoNothing()
            .run();
        }

        return {
          ...folder,
          parentId: node.parentId,
        };
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
      const rows = db.select().from(this.#paths).where(eq(this.#paths.child, id)).all();

      const parentIds = [...new Set(rows.map((p) => p.parent))];
      if (parentIds.length === 0) return [];

      const nodes = db.select().from(this.#items).where(inArray(this.#items.id, parentIds)).all();

      const nameMap = new Map(nodes.map((n) => [n.id, n.name]));

      return rows
        .map((p) => ({
          id: p.parent,
          name: nameMap.get(p.parent) ?? "unknown",
          depth: p.depth,
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
      const rows = db.select().from(this.#paths).where(eq(this.#paths.parent, id)).all();

      const childIds = [...new Set(rows.map((p) => p.child))];
      if (childIds.length === 0) return [];

      const nodes = db.select().from(this.#items).where(inArray(this.#items.id, childIds)).all();

      const nameMap = new Map(nodes.map((n) => [n.id, n.name]));

      return rows
        .map((p) => ({
          id: p.child,
          name: nameMap.get(p.child) ?? "unknown",
          depth: p.depth,
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
      db.transaction((tx) => {
        const subtree = tx
          .select({ child: this.#paths.child, depth: this.#paths.depth })
          .from(this.#paths)
          .where(eq(this.#paths.parent, id))
          .all();

        if (subtree.length === 0) return false;
        const subtreeIds = [...new Set(subtree.map((r) => r.child))];
        const depthMap = new Map(subtree.map((r) => [r.child, r.depth]));

        tx.delete(this.#paths).where(inArray(this.#paths.child, subtreeIds)).run();

        const newAncestors = newParentId
          ? tx
              .select({ parent: this.#paths.parent, depth: this.#paths.depth })
              .from(this.#paths)
              .where(eq(this.#paths.child, newParentId))
              .all()
          : [];

        const values: { parent: string; child: string; depth: number }[] = [];

        for (const childId of subtreeIds) {
          values.push({ parent: childId, child: childId, depth: 0 });

          const relativeDepth = depthMap.get(childId)!;
          for (const a of newAncestors) {
            values.push({
              parent: a.parent,
              child: childId,
              depth: a.depth + 1 + relativeDepth,
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
      db.transaction((tx) => {
        tx.update(this.#items).set({ name: newName }).where(eq(this.#items.id, id)).run();
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

  getAll(parentId: string | null = null) {
    const result = attempt(() => {
      let items: TagFolderSelect[];
      if (parentId === null) {
        items = db.select().from(this.#items).all();
      } else {
        const childPaths = db
          .select()
          .from(this.#paths)
          .where(eq(this.#paths.parent, parentId))
          .all();
        const childIds = childPaths.map((p) => p.child);
        if (childIds.length === 0) return [];
        items = db.select().from(this.#items).where(inArray(this.#items.id, childIds)).all();
      }

      if (items.length === 0) return [];

      // build every folder's name + direct parent so a path can be walked for
      // any id, including ancestors that are not part of the returned subset
      const allItems = db.select().from(this.#items).all();
      const nameById = new Map(allItems.map((i) => [i.id, i.name]));

      const depthOne = db
        .select({ child: this.#paths.child, parent: this.#paths.parent })
        .from(this.#paths)
        .where(eq(this.#paths.depth, 1))
        .all();
      const parentByChild = new Map(depthOne.map((p) => [p.child, p.parent]));

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
        id: item.id,
        name: item.name,
        parentId: parentByChild.get(item.id) ?? null,
        path: pathOf(item.id),
      }));
    });

    if (result.error) {
      return err({
        reason: "DB_ERROR",
        cause: errorToString(result.error),
      } as const satisfies NeverThrowError);
    }

    return ok(result.data);
  }

  get(id: string) {
    const all = this.getAll();
    if (all.isErr()) return err(all.error);

    const node = all.value.find((folder) => folder.id === id);
    if (!node) {
      return err({
        reason: "FOLDER_NOT_FOUND",
        cause: `no folder at id ${id}`,
      } as const satisfies NeverThrowError);
    }

    return ok(node);
  }

  deleteRecursive(id: string) {
    const result = attempt(() =>
      db.transaction((tx) => {
        const children = tx
          .select({ id: this.#paths.child })
          .from(this.#paths)
          .where(eq(this.#paths.parent, id))
          .all();

        const ids = children.map((d) => d.id);
        if (ids.length === 0) return;

        if (this.#tagTable)
          tx.delete(this.#tagTable).where(inArray(this.#tagTable.folderId, ids)).run();
        tx.delete(this.#paths).where(inArray(this.#paths.child, ids)).run();
        tx.delete(this.#items).where(inArray(this.#items.id, ids)).run();
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

export const tagFoldersClosureTable = new ClosureTable(tag_folders, tag_folder_paths, tags);
