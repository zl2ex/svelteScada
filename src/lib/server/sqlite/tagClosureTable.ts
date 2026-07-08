import { eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { tables, type TagFolder, type TagSelect } from "./tables";

export interface ClosureTableNode extends TagFolder {
  parentId: string | null;
  tags?: TagSelect[];
}
export class ClosureTable {
  insertNode(node: TagFolder, parentId: string | null = null) {
    return db.transaction((tx) => {
      const values: Record<string, unknown> = { name: node.name };
      if (node.id) values.id = node.id;
      const [folder] = tx
        .insert(tables.tag_folders)
        .values(values as any)
        .returning()
        .all();

      if (parentId === null) {
        tx.insert(tables.tag_folder_paths)
          .values({ parent: folder.id, child: folder.id, depth: 0 })
          .run();
      } else {
        const parents = tx
          .select()
          .from(tables.tag_folder_paths)
          .where(eq(tables.tag_folder_paths.child, parentId))
          .all();

        tx.insert(tables.tag_folder_paths)
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
    const paths = db
      .select()
      .from(tables.tag_folder_paths)
      .where(eq(tables.tag_folder_paths.child, id))
      .all();

    const parentIds = [...new Set(paths.map((p) => p.parent))];
    if (parentIds.length === 0) return [];

    const nodes = db
      .select()
      .from(tables.tag_folders)
      .where(inArray(tables.tag_folders.id, parentIds))
      .all();

    const nameMap = new Map(nodes.map((n) => [n.id, n.name]));

    return paths
      .map((p) => ({
        id: p.parent,
        name: nameMap.get(p.parent) ?? "unknown",
        depth: p.depth,
      }))
      .sort((a, b) => a.depth - b.depth);
  }

  getChildren(id: string) {
    const paths = db
      .select()
      .from(tables.tag_folder_paths)
      .where(eq(tables.tag_folder_paths.parent, id))
      .all();

    const childIds = [...new Set(paths.map((p) => p.child))];
    if (childIds.length === 0) return [];

    const nodes = db
      .select()
      .from(tables.tag_folders)
      .where(inArray(tables.tag_folders.id, childIds))
      .all();

    const nameMap = new Map(nodes.map((n) => [n.id, n.name]));

    return paths
      .map((p) => ({
        id: p.child,
        name: nameMap.get(p.child) ?? "unknown",
        depth: p.depth,
      }))
      .sort((a, b) => a.depth - b.depth);
  }

  deleteCascade(id: string) {
    return db.transaction((tx) => {
      const childs = tx
        .select({ id: tables.tag_folder_paths.child })
        .from(tables.tag_folder_paths)
        .where(eq(tables.tag_folder_paths.parent, id))
        .all();

      const ids = childs.map((d) => d.id);
      if (ids.length === 0) return;

      tx.delete(tables.tag).where(inArray(tables.tag.folderId, ids)).run();

      tx.delete(tables.tag_folder_paths)
        .where(inArray(tables.tag_folder_paths.child, ids))
        .run();

      tx.delete(tables.tag_folders)
        .where(inArray(tables.tag_folders.id, ids))
        .run();
    });
  }

  moveNode(id: string, newParentId: string | undefined) {
    return db.transaction((tx) => {
      const subtree = tx
        .select({
          child: tables.tag_folder_paths.child,
          depth: tables.tag_folder_paths.depth,
        })
        .from(tables.tag_folder_paths)
        .where(eq(tables.tag_folder_paths.parent, id))
        .all();

      if (subtree.length === 0) return false;
      const subtreeIds = [...new Set(subtree.map((r) => r.child))];
      const depthMap = new Map(subtree.map((r) => [r.child, r.depth]));

      tx.delete(tables.tag_folder_paths)
        .where(inArray(tables.tag_folder_paths.child, subtreeIds))
        .run();

      const newAncestors = newParentId
        ? tx
            .select({
              parent: tables.tag_folder_paths.parent,
              depth: tables.tag_folder_paths.depth,
            })
            .from(tables.tag_folder_paths)
            .where(eq(tables.tag_folder_paths.child, newParentId))
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

      tx.insert(tables.tag_folder_paths).values(values).run();
      return true;
    });
  }

  renameNode(id: string, newName: string) {
    return db.transaction((tx) => {
      tx.update(tables.tag_folders)
        .set({ name: newName })
        .where(eq(tables.tag_folders.id, id))
        .run();
    });
  }

  async getAll(parentId: string | null = null): Promise<ClosureTableNode[]> {
    let folders = await db.query.tag_folders.findMany({
      where: {
        parentPaths: parentId
          ? {
              parent: { eq: parentId },
            }
          : {},
      },
      with: { parentPaths: true, tags: true },
    });

    return folders.map((f) => {
      return {
        id: f.id,
        name: f.name,
        parentId: f.parentPaths.find((p) => p.depth == 1)?.parent ?? null,
        tags: f.tags,
      };
    });
  }

  async getNode(nodeId: string): Promise<ClosureTableNode | undefined> {
    const node = await db.query.tag_folders.findFirst({
      where: {
        id: { eq: nodeId },
      },
      with: { parentPaths: true },
    });

    if (!node) return undefined;

    return {
      id: node.id,
      name: node.name,
      parentId: node.parentPaths.find((f) => f.depth == 1)?.parent ?? null,
    };
  }
}

export const tagClosureTable = new ClosureTable();
