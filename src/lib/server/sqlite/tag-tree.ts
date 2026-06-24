import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import { tables } from "./tables";

function insertFolder(name: string, parentId: string | null) {
  return db.transaction((tx) => {
    const [folder] = tx
      .insert(tables.tag_folders)
      .values({ name })
      .returning()
      .all();

    // insert at root if no parent provided
    if (parentId === null) {
      tx.insert(tables.tag_folder_paths)
        .values({
          ancestor: folder.id,
          descendant: folder.id,
          depth: 0,
        })
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

//insertFolder("moreNested", "3d836f99-65e0-45b5-971b-21594059e7d1");

async function getBreadcrumbs(folderId: string) {
  const paths = await db.query.tag_folder_paths.findMany({
    where: { descendant: { eq: folderId } },
    with: { ancestorFolder: true },
    orderBy: (path, { asc }) => [asc(path.depth)],
  });
  return paths.map((p) => ({
    id: p.ancestorFolder.id,
    name: p.ancestorFolder.name,
    depth: p.depth,
  }));
}

async function getDescendants(folderId: string) {
  const paths = await db.query.tag_folder_paths.findMany({
    where: { ancestor: { eq: folderId } },
    with: { descendantFolder: true },
    orderBy: (path, { asc }) => [asc(path.depth)],
  });
  return paths.map((p) => ({
    id: p.descendantFolder.id,
    name: p.descendantFolder.name,
    depth: p.depth,
  }));
}

async function addNode(name, type, parentId = null) {
  // Use a transaction to keep the two tables synchronized
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    // Step 1: Insert into the nodes table
    const [nodeResult] = await connection.execute(
      "INSERT INTO nodes (name, type) VALUES (?, ?)",
      [name, type],
    );
    const newNodeId = nodeResult.insertId;

    // Step 2: Insert the self-referencing record (distance 0)
    await connection.execute(
      "INSERT INTO node_tree (ancestor_id, descendant_id, distance) VALUES (?, ?, 0)",
      [newNodeId, newNodeId],
    );

    // Step 3: If it has a parent, link it to all the parent's ancestors
    if (parentId) {
      await connection.execute(
        `
        INSERT INTO node_tree (ancestor_id, descendant_id, distance)
        SELECT ancestor_id, ?, distance + 1
        FROM node_tree
        WHERE descendant_id = ?
      `,
        [newNodeId, parentId],
      );
    }

    await connection.commit();
    return newNodeId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
// Usage: Create a new folder inside 'Projects' (ID: 2)
// const newFolderId = await addNode('Invoices', 'folder', 2);

async function deleteNodeCascade(nodeId) {
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    // Step 1: Delete all tree relationships for this node and its sub-items
    await connection.execute(
      `
      DELETE FROM node_tree
      WHERE descendant_id IN (
        SELECT descendant_id FROM (
          SELECT descendant_id FROM node_tree WHERE ancestor_id = ?
        ) AS temp
      )
    `,
      [nodeId],
    );

    // Step 2: Delete the actual item rows from the nodes table
    await connection.execute(
      `
      DELETE FROM nodes
      WHERE id IN (
        SELECT descendant_id FROM (
          SELECT descendant_id FROM node_tree WHERE ancestor_id = ?
        ) AS temp
      )
    `,
      [nodeId],
    );

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Usage: Permanently delete folder ID 2 and all files inside it
// await deleteNodeCascade(2);

async function moveNode(nodeId, newParentId) {
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    // Step 1: Disconnect the node and its descendants from all old ancestors
    await connection.execute(
      `
      DELETE FROM node_tree
      WHERE descendant_id IN (
        SELECT d FROM (SELECT descendant_id AS d FROM node_tree WHERE ancestor_id = ?) AS t1
      )
      AND ancestor_id IN (
        SELECT a FROM (SELECT ancestor_id AS a FROM node_tree WHERE descendant_id = ? AND ancestor_id != ?) AS t2
      )
    `,
      [nodeId, nodeId, nodeId],
    );

    // Step 2: Connect the node and its descendants to the new ancestors
    await connection.execute(
      `
      INSERT INTO node_tree (ancestor_id, descendant_id, distance)
      SELECT supertree.ancestor_id, subtree.descendant_id, supertree.distance + subtree.distance + 1
      FROM node_tree AS supertree
      CROSS JOIN node_tree AS subtree
      WHERE supertree.descendant_id = ?
        AND subtree.ancestor_id = ?
    `,
      [newParentId, nodeId],
    );

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Usage: Move 'Projects' folder (ID: 2) to the root or a new parent folder (ID: 5)
// await moveNode(2, 5);

async function renameNode(nodeId, newName) {
  await db.execute("UPDATE nodes SET name = ? WHERE id = ?", [newName, nodeId]);
  return true;
}

// Usage: Change 'todo.txt' to 'completed.txt'
// await renameNode(3, 'completed.txt');

export type TagTreeFolder = {
  id: string;
  name: string;
  children: TagTreeFolder[];
  tags: {
    id: string;
    name: string;
    dataType: string;
    value: number | null;
    folderId: string | null;
  }[];
};

function buildTree(flatData) {
  const map = {};
  const roots = [];

  // Step 1: Initialize the map with node data and an empty children array
  flatData.forEach((item) => {
    map[item.id] = {
      id: item.id,
      name: item.name,
      type: item.type,
      children: [],
    };
  });

  // Step 2: Link parents to children, or identify top-level items
  flatData.forEach((item) => {
    const mappedNode = map[item.id];

    // Look for the immediate parent (where distance is 1 relative to this node)
    const immediateParent = flatData.find(
      (p) => p.descendant_id === item.id && p.distance === 1,
    );

    if (immediateParent && map[immediateParent.ancestor_id]) {
      // Add to parent's children array
      map[immediateParent.ancestor_id].children.push(mappedNode);
    } else {
      // If no parent row exists in this specific dataset, it is a root node
      // We also check to prevent duplicating a node if it appears multiple times
      if (!roots.includes(mappedNode)) {
        roots.push(mappedNode);
      }
    }
  });

  return roots;
}

export async function getNestedFolderTree(rootFolderId: string) {
  // Query gets all nodes in the scope AND their internal relationships
  const query = `
    SELECT 
      n.id, 
      n.name, 
      n.type, 
      t.ancestor_id, 
      t.descendant_id, 
      t.distance
    FROM nodes n
    JOIN node_tree t ON n.id = t.descendant_id
    WHERE t.descendant_id IN (
      SELECT descendant_id FROM node_tree WHERE ancestor_id = ?
    );
  `;

  const r = await db.query.tag_folders.findMany({
    with: {
      descendantPaths: true,
      ancestorPaths: true,
    },
    /*where: {
      ancestorPaths: {
        ancestor: { eq: rootFolderId }
      },
    },*/
  });

  return r;

  //const [rows] = await db.execute(query, [rootFolderId]);

  // Format the flat SQL rows into a nested object
  return buildTree(r);
}

export async function getTagTree() {
  const [folders, edges] = await Promise.all([
    db.query.tag_folders.findMany({
      with: {
        tags: true,
      },
    }),
    db.query.tag_folder_paths.findMany({
      //where: (path, { eq }) => eq(path.depth, 1),
    }),
  ]);

  console.debug(folders);
  console.debug(edges);

  const folderMap = new Map<string, TagTreeFolder>();
  for (const f of folders) {
    folderMap.set(f.id, { id: f.id, name: f.name, children: [], tags: f.tags });
  }

  for (const edge of edges) {
    const parent = folderMap.get(edge.ancestor);
    const child = folderMap.get(edge.descendant);
    if (parent && child) parent.children.push(child);
  }

  const hasParent = new Set(edges.map((e) => e.descendant));
  return folders
    .filter((f) => !hasParent.has(f.id))
    .map((f) => folderMap.get(f.id)!);
}

export async function getSubTree(folderId: string) {
  let paths = await db.query.tag_folder_paths.findMany({
    where: { ancestor: { eq: folderId } },
    with: {
      descendantFolder: {
        with: {
          tags: true,
        },
      },
    },
  });

  return paths.flatMap((p) => p.descendantFolder?.tags);
}
