import { and, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { tables, type TagFolder, type TagSelect } from "./tables";

export interface ClosureTableNode extends TagFolder {
  children: ClosureTableNode[];
  tags: TagSelect[];
}
export class ClosureTable {
  insertNode(name: string, parentId: string | null = null) {
    return db.transaction((tx) => {
      const [folder] = tx
        .insert(tables.tag_folders)
        .values({ name })
        .returning()
        .all();

      if (parentId === null) {
        tx.insert(tables.tag_folder_paths)
          .values({ ancestor: folder.id, descendant: folder.id, depth: 0 })
          .run();
      } else {
        const parentAncestors = tx
          .select()
          .from(tables.tag_folder_paths)
          .where(eq(tables.tag_folder_paths.descendant, parentId))
          .all();

        tx.insert(tables.tag_folder_paths)
          .values([
            ...parentAncestors.map((row) => ({
              ancestor: row.ancestor,
              descendant: folder.id,
              depth: row.depth + 1,
            })),
            { ancestor: folder.id, descendant: folder.id, depth: 0 },
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
      .where(eq(tables.tag_folder_paths.descendant, id))
      .all();

    const ancestorIds = [...new Set(paths.map((p) => p.ancestor))];
    if (ancestorIds.length === 0) return [];

    const nodes = db
      .select()
      .from(tables.tag_folders)
      .where(inArray(tables.tag_folders.id, ancestorIds))
      .all();

    const nameMap = new Map(nodes.map((n) => [n.id, n.name]));

    return paths
      .map((p) => ({
        id: p.ancestor,
        name: nameMap.get(p.ancestor) ?? "unknown",
        depth: p.depth,
      }))
      .sort((a, b) => a.depth - b.depth);
  }

  getDescendants(id: string) {
    const paths = db
      .select()
      .from(tables.tag_folder_paths)
      .where(eq(tables.tag_folder_paths.ancestor, id))
      .all();

    const descendantIds = [...new Set(paths.map((p) => p.descendant))];
    if (descendantIds.length === 0) return [];

    const nodes = db
      .select()
      .from(tables.tag_folders)
      .where(inArray(tables.tag_folders.id, descendantIds))
      .all();

    const nameMap = new Map(nodes.map((n) => [n.id, n.name]));

    return paths
      .map((p) => ({
        id: p.descendant,
        name: nameMap.get(p.descendant) ?? "unknown",
        depth: p.depth,
      }))
      .sort((a, b) => a.depth - b.depth);
  }

  deleteCascade(id: string) {
    return db.transaction((tx) => {
      const descendants = tx
        .select({ id: tables.tag_folder_paths.descendant })
        .from(tables.tag_folder_paths)
        .where(eq(tables.tag_folder_paths.ancestor, id))
        .all();

      const ids = descendants.map((d) => d.id);
      if (ids.length === 0) return;

      tx.delete(tables.tag).where(inArray(tables.tag.folderId, ids)).run();

      tx.delete(tables.tag_folder_paths)
        .where(inArray(tables.tag_folder_paths.descendant, ids))
        .run();

      tx.delete(tables.tag_folders)
        .where(inArray(tables.tag_folders.id, ids))
        .run();
    });
  }

  moveNode(id: string, newParentId: string) {
    return db.transaction((tx) => {
      const subtreeRows = tx
        .select({
          id: tables.tag_folder_paths.descendant,
          depth: tables.tag_folder_paths.depth,
        })
        .from(tables.tag_folder_paths)
        .where(eq(tables.tag_folder_paths.ancestor, id))
        .all();

      if (subtreeRows.length === 0) return false;
      const descendantIds = subtreeRows.map((r) => r.id);
      const depthMap = new Map(subtreeRows.map((r) => [r.id, r.depth]));

      const oldAncestors = tx
        .select({ id: tables.tag_folder_paths.ancestor })
        .from(tables.tag_folder_paths)
        .where(eq(tables.tag_folder_paths.descendant, id))
        .all();

      const oldAncestorIds = oldAncestors
        .map((a) => a.id)
        .filter((aId) => aId !== id);

      if (oldAncestorIds.length > 0) {
        tx.delete(tables.tag_folder_paths)
          .where(
            and(
              inArray(tables.tag_folder_paths.descendant, descendantIds),
              inArray(tables.tag_folder_paths.ancestor, oldAncestorIds),
            ),
          )
          .run();
      }

      const newParentAncestors = tx
        .select({
          ancestor: tables.tag_folder_paths.ancestor,
          depth: tables.tag_folder_paths.depth,
        })
        .from(tables.tag_folder_paths)
        .where(eq(tables.tag_folder_paths.descendant, newParentId))
        .all();

      const values: {
        ancestor: string;
        descendant: string;
        depth: number;
      }[] = [];

      for (const na of newParentAncestors) {
        for (const dId of descendantIds) {
          values.push({
            ancestor: na.ancestor,
            descendant: dId,
            depth: na.depth + depthMap.get(dId)! + 1,
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

  async getTree(parentId: string | null = null) {
    let folders = await db.query.tag_folders.findMany({
      ...(parentId !== null && {
        where: { ancestorPaths: { ancestor: { eq: parentId } } },
      }),
      with: { descendantPaths: true, tags: true },
    });

    if (folders.length === 0) return [];

    const folderMap = new Map<string, any>();
    for (const folder of folders) {
      const { descendantPaths, ...rest } = folder;
      folderMap.set(folder.id, { ...rest, children: [] });
    }

    for (const folder of folders) {
      const parent = folderMap.get(folder.id);
      if (!parent) continue;
      for (const path of folder.descendantPaths || []) {
        if (path.depth !== 1) continue;
        const child = folderMap.get(path.descendant);
        if (child) parent.children.push(child);
      }
    }

    if (parentId !== null) {
      const root = folderMap.get(parentId);
      return root ? [root] : [];
    }

    const hasParent = new Set<string>();
    for (const node of folders) {
      for (const path of node.descendantPaths || []) {
        if (path.depth > 0) hasParent.add(path.descendant);
      }
    }

    let ret = folders
      .filter((n) => !hasParent.has(n.id))
      .map((n) => folderMap.get(n.id)!);

    return ret;
  }
}

export const tagClosureTable = new ClosureTable();
