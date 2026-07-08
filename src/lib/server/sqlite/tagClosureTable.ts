import { eq, inArray } from "drizzle-orm";
import { db } from "./db";
import {
  tag_folders,
  tag_folder_paths,
  tag,
  type TagFolder,
  type TagSelect,
} from "./tables";

export interface ClosureTableNode extends TagFolder {
  parentId: string | null;
  tags?: TagSelect[];
}

export class ClosureTable {
  private items: typeof tag_folders;
  private paths: typeof tag_folder_paths;

  constructor(items: typeof tag_folders, paths: typeof tag_folder_paths) {
    this.items = items;
    this.paths = paths;
  }

  add(node: TagFolder, parentId: string | null = null) {
    return db.transaction((tx) => {
      const [folder] = tx.insert(this.items).values(node).returning().all();

      if (parentId === null) {
        tx.insert(this.paths)
          .values({ parent: folder.id, child: folder.id, depth: 0 })
          .run();
      } else {
        const parents = tx
          .select()
          .from(this.paths)
          .where(eq(this.paths.child, parentId))
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

      return folder;
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

  getChildren(id: string) {
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
    let items: TagFolder[];
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

    return items.map((item) => {
      const parentPaths = db
        .select({ parent: this.paths.parent, depth: this.paths.depth })
        .from(this.paths)
        .where(eq(this.paths.child, item.id))
        .all();
      return {
        id: item.id,
        name: item.name,
        parentId: parentPaths.find((p) => p.depth === 1)?.parent ?? null,
      };
    });
  }

  get(id: string): ClosureTableNode | undefined {
    const [node] = db
      .select()
      .from(this.items)
      .where(eq(this.items.id, id))
      .all();
    if (!node) return undefined;

    const parentPaths = db
      .select({ parent: this.paths.parent, depth: this.paths.depth })
      .from(this.paths)
      .where(eq(this.paths.child, id))
      .all();

    return {
      id: node.id,
      name: node.name,
      parentId: parentPaths.find((p) => p.depth === 1)?.parent ?? null,
    };
  }
}

export const tagFoldersClosureTable = new ClosureTable(
  tag_folders,
  tag_folder_paths,
);

export function deleteCascade(id: string) {
  return db.transaction((tx) => {
    const childs = tx
      .select({ id: tag_folder_paths.child })
      .from(tag_folder_paths)
      .where(eq(tag_folder_paths.parent, id))
      .all();

    const ids = childs.map((d) => d.id);
    if (ids.length === 0) return;

    tx.delete(tag).where(inArray(tag.folderId, ids)).run();
    tx.delete(tag_folder_paths)
      .where(inArray(tag_folder_paths.child, ids))
      .run();
    tx.delete(tag_folders).where(inArray(tag_folders.id, ids)).run();
  });
}
