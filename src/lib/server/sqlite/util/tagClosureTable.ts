import { eq, inArray, and } from "drizzle-orm";
import { db } from "../db";
import {
  tag_folders,
  tag_folder_paths,
  tags,
  type TagFolderSelect,
  type TagSelect,
} from "../tables";
import { err, ok, type Result } from "neverthrow";
import { tryCatch } from "$lib/util/tryCatch";

export interface ClosureTableNode extends TagFolderSelect {
  parentId: string | null;
}

export type ClosureTableNodeOptionalId = Omit<ClosureTableNode, "id"> & {
  id?: string;
};

export class ClosureTable {
  private items: typeof tag_folders;
  private paths: typeof tag_folder_paths;
  private tagTable?: typeof tags;

  constructor(
    items: typeof tag_folders,
    paths: typeof tag_folder_paths,
    tagTable?: typeof tags,
  ) {
    this.items = items;
    this.paths = paths;
    this.tagTable = tagTable;
  }

  add(node: ClosureTableNode) {
    const result = tryCatch(() =>
      db.transaction((tx) => {
        const [folder] = tx
          .insert(this.items)
          .values(node)
          // TD WIP fix conflict updates
          // .onConflictDoUpdate({
          //   target: this.items.id,
          //   set: { name: node.name },
          // })
          .returning()
          .all();

        if (node.parentId === null) {
          tx.insert(this.paths)
            .values({ parent: folder.id, child: folder.id, depth: 0 })
            //.onConflictDoNothing()
            .run();
        } else {
          const parents = tx
            .select()
            .from(this.paths)
            .where(eq(this.paths.child, node.parentId))
            .all();

          tx.insert(this.paths)
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
      return err({ reason: "DB_ERROR", cause: result.error } as const);
    }

    return ok(result.value);
  }

  getBreadcrumbs(id: string) {
    const result = tryCatch(() => {
      const rows = db
        .select()
        .from(this.paths)
        .where(eq(this.paths.child, id))
        .all();

      const parentIds = [...new Set(rows.map((p) => p.parent))];
      if (parentIds.length === 0) return [];

      const nodes = db
        .select()
        .from(this.items)
        .where(inArray(this.items.id, parentIds))
        .all();

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
      return err({ reason: "DB_ERROR", cause: result.error } as const);
    }

    return ok(result.value);
  }

  getSubtree(id: string) {
    const result = tryCatch(() => {
      const rows = db
        .select()
        .from(this.paths)
        .where(eq(this.paths.parent, id))
        .all();

      const childIds = [...new Set(rows.map((p) => p.child))];
      if (childIds.length === 0) return [];

      const nodes = db
        .select()
        .from(this.items)
        .where(inArray(this.items.id, childIds))
        .all();

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
      return err({ reason: "DB_ERROR", cause: result.error } as const);
    }

    return ok(result.value);
  }

  move(id: string, newParentId: string | undefined) {
    const result = tryCatch(() =>
      db.transaction((tx) => {
        const subtree = tx
          .select({ child: this.paths.child, depth: this.paths.depth })
          .from(this.paths)
          .where(eq(this.paths.parent, id))
          .all();

        if (subtree.length === 0) return false;
        const subtreeIds = [...new Set(subtree.map((r) => r.child))];
        const depthMap = new Map(subtree.map((r) => [r.child, r.depth]));

        tx.delete(this.paths)
          .where(inArray(this.paths.child, subtreeIds))
          .run();

        const newAncestors = newParentId
          ? tx
              .select({ parent: this.paths.parent, depth: this.paths.depth })
              .from(this.paths)
              .where(eq(this.paths.child, newParentId))
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

        tx.insert(this.paths).values(values).run();
        return true;
      }),
    );

    if (result.error) {
      return err({ reason: "DB_ERROR", cause: result.error } as const);
    }

    return ok(result.value);
  }

  rename(id: string, newName: string) {
    const result = tryCatch(() =>
      db.transaction((tx) => {
        tx.update(this.items)
          .set({ name: newName })
          .where(eq(this.items.id, id))
          .run();
      }),
    );

    if (result.error) {
      return err({ reason: "DB_ERROR", cause: result.error } as const);
    }

    return ok(result.value);
  }

  getAll(
    parentId: string | null = null,
  ): Result<ClosureTableNode[], { reason: "DB_ERROR"; cause: Error }> {
    const result = tryCatch(() => {
      let items: TagFolderSelect[];
      if (parentId === null) {
        items = db.select().from(this.items).all();
      } else {
        const childPaths = db
          .select()
          .from(this.paths)
          .where(eq(this.paths.parent, parentId))
          .all();
        const childIds = childPaths.map((p) => p.child);
        if (childIds.length === 0) return [];
        items = db
          .select()
          .from(this.items)
          .where(inArray(this.items.id, childIds))
          .all();
      }

      const ids = items.map((i) => i.id);
      if (ids.length === 0) return [];

      const allPaths = db
        .select({
          child: this.paths.child,
          parent: this.paths.parent,
          depth: this.paths.depth,
        })
        .from(this.paths)
        .where(inArray(this.paths.child, ids))
        .all();

      const parentByChild: Record<string, string | null> = {};
      for (const p of allPaths) {
        if (p.depth === 1) {
          parentByChild[p.child] = p.parent;
        }
      }

      return items.map((item) => ({
        id: item.id,
        name: item.name,
        parentId: parentByChild[item.id] ?? null,
      }));
    });

    if (result.error) {
      return err({ reason: "DB_ERROR", cause: result.error } as const);
    }

    return ok(result.value);
  }

  get(id: string) {
    const result = tryCatch(() => {
      const [row] = db
        .select({
          id: this.items.id,
          name: this.items.name,
          parentId: this.paths.parent,
        })
        .from(this.items)
        .leftJoin(
          this.paths,
          and(eq(this.paths.child, this.items.id), eq(this.paths.depth, 1)),
        )
        .where(eq(this.items.id, id))
        .all();

      return {
        id: row.id,
        name: row.name,
        parentId: row.parentId ?? null,
      };
    });

    if (result.error) {
      return err({ reason: "DB_ERROR", cause: result.error } as const);
    }

    return ok(result.value);
  }

  deleteRecursive(id: string) {
    const result = tryCatch(() =>
      db.transaction((tx) => {
        const children = tx
          .select({ id: this.paths.child })
          .from(this.paths)
          .where(eq(this.paths.parent, id))
          .all();

        const ids = children.map((d) => d.id);
        if (ids.length === 0) return;

        if (this.tagTable)
          tx.delete(this.tagTable)
            .where(inArray(this.tagTable.folderId, ids))
            .run();
        tx.delete(this.paths).where(inArray(this.paths.child, ids)).run();
        tx.delete(this.items).where(inArray(this.items.id, ids)).run();
      }),
    );

    if (result.error) {
      return err({ reason: "DB_ERROR", cause: result.error } as const);
    }

    return ok(result.value);
  }
}

export const tagFoldersClosureTable = new ClosureTable(
  tag_folders,
  tag_folder_paths,
  tags,
);
