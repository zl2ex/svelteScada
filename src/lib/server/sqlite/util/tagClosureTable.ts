import { eq, inArray, and } from "drizzle-orm";
import { db } from "../db";
import {
  tag_folders,
  tag_folder_paths,
  tags,
  type TagFolderSelect,
  type TagSelect,
} from "../tables";

export interface ClosureTableNode extends TagFolderSelect {
  parentId: string | null;
  //tags?: TagSelect[];
}

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
    return db.transaction((tx) => {
      const [folder] = tx.insert(this.items).values(node).returning().all();

      if (node.parentId === null) {
        tx.insert(this.paths)
          .values({ parent: folder.id, child: folder.id, depth: 0 })
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
          .run();
      }

      return {
        ...folder,
        parentId: node.parentId,
      };
    });
  }

  getBreadcrumbs(id: string) {
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
  }

  getSubtree(id: string) {
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
  }

  move(id: string, newParentId: string | undefined) {
    return db.transaction((tx) => {
      const subtree = tx
        .select({ child: this.paths.child, depth: this.paths.depth })
        .from(this.paths)
        .where(eq(this.paths.parent, id))
        .all();

      if (subtree.length === 0) return false;
      const subtreeIds = [...new Set(subtree.map((r) => r.child))];
      const depthMap = new Map(subtree.map((r) => [r.child, r.depth]));

      tx.delete(this.paths).where(inArray(this.paths.child, subtreeIds)).run();

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
    });
  }

  rename(id: string, newName: string) {
    return db.transaction((tx) => {
      tx.update(this.items)
        .set({ name: newName })
        .where(eq(this.items.id, id))
        .run();
    });
  }

  getAll(parentId: string | null = null): ClosureTableNode[] {
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
  }

  get(id: string): ClosureTableNode | undefined {
    const [node] = db
      .select()
      .from(this.items)
      .where(eq(this.items.id, id))
      .all();
    if (!node) return undefined;

    const [parentRow] = db
      .select({ parent: this.paths.parent })
      .from(this.paths)
      .where(and(eq(this.paths.child, id), eq(this.paths.depth, 1)))
      .all();

    return {
      id: node.id,
      name: node.name,
      parentId: parentRow?.parent ?? null,
    };
  }

  deleteRecursive(id: string) {
    return db.transaction((tx) => {
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
    });
  }
}

export const tagFoldersClosureTable = new ClosureTable(
  tag_folders,
  tag_folder_paths,
  tags,
);
