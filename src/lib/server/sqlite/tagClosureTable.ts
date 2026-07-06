import { and, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { tables, type TagFolder, type TagSelect } from "./tables";

export interface ClosureTableNode extends TagFolder {
  parentId: string | undefined;
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

  moveNode(id: string, newParentId: string) {
    return db.transaction((tx) => {
      const subtreeRows = tx
        .select({
          id: tables.tag_folder_paths.child,
          depth: tables.tag_folder_paths.depth,
        })
        .from(tables.tag_folder_paths)
        .where(eq(tables.tag_folder_paths.parent, id))
        .all();

      if (subtreeRows.length === 0) return false;
      const childIds = subtreeRows.map((r) => r.id);
      const depthMap = new Map(subtreeRows.map((r) => [r.id, r.depth]));

      const oldparents = tx
        .select({ id: tables.tag_folder_paths.parent })
        .from(tables.tag_folder_paths)
        .where(eq(tables.tag_folder_paths.child, id))
        .all();

      const oldparentIds = oldparents
        .map((a) => a.id)
        .filter((aId) => aId !== id);

      if (oldparentIds.length > 0) {
        tx.delete(tables.tag_folder_paths)
          .where(
            and(
              inArray(tables.tag_folder_paths.child, childIds),
              inArray(tables.tag_folder_paths.parent, oldparentIds),
            ),
          )
          .run();
      }

      const newParentparents = tx
        .select({
          parent: tables.tag_folder_paths.parent,
          depth: tables.tag_folder_paths.depth,
        })
        .from(tables.tag_folder_paths)
        .where(eq(tables.tag_folder_paths.child, newParentId))
        .all();

      const values: {
        parent: string;
        child: string;
        depth: number;
      }[] = [];

      for (const na of newParentparents) {
        for (const dId of childIds) {
          values.push({
            parent: na.parent,
            child: dId,
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
        parentId: f.parentPaths.find((p) => p.depth == 1)?.parent,
        tags: f.tags,
      };
    });
  }

  async getTree(parentId: string | null = null): Promise<ClosureTableNode[]> {
    let folders = await db.query.tag_folders.findMany({
      ...(parentId !== null && {
        where: { parentPaths: { parent: { eq: parentId } } },
      }),
      with: { childPaths: true, tags: true },
    });

    if (folders.length === 0) return [];

    const folderMap = new Map<string, any>();
    for (const folder of folders) {
      const { childPaths, ...rest } = folder;
      folderMap.set(folder.id, { ...rest, children: [] });
    }

    for (const folder of folders) {
      const parent = folderMap.get(folder.id);
      if (!parent) continue;
      for (const path of folder.childPaths || []) {
        if (path.depth !== 1) continue;
        const child = folderMap.get(path.child);
        if (child) parent.children.push(child);
      }
    }

    if (parentId !== null) {
      const root = folderMap.get(parentId);
      return root ? [root] : [];
    }

    const hasParent = new Set<string>();
    for (const node of folders) {
      for (const path of node.childPaths || []) {
        if (path.depth > 0) hasParent.add(path.child);
      }
    }

    let ret = folders
      .filter((n) => !hasParent.has(n.id))
      .map((n) => folderMap.get(n.id)!);

    return ret;
  }
}

export const tagClosureTable = new ClosureTable();
