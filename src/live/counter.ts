import { db } from "$lib/server/sqlite/db";
import {
  tagClosureTable,
  type ClosureTableNode,
} from "$lib/server/sqlite/tagClosureTable";
import { live } from "svelte-realtime/server";

let count = 0;

export const increment = live((ctx) => {
  count++;
  ctx.publish("count", "set", count);
  return count;
});

export const counter = live.stream(
  "count",
  (ctx) => {
    return count;
  },
  { merge: "set" },
);

export const tree = live.stream(
  "tag-tree",
  async (ctx): Promise<ClosureTableNode[]> => {
    //return await getSubTree("root");
    return await tagClosureTable.getTree();

    // 	SELECT n.*, t.depth
    // FROM nodes n
    // JOIN node_tree t ON n.id = t.descendant_id
    // WHERE t.ancestor_id = 1; -- 1 is the target folder ID

    /*
    return await db
      .select({
        id: tables.tag_folders.id,
        name: tables.tag_folders.name,
        child: tables.tag_folder_paths.descendant,
        depth: tables.tag_folder_paths.depth,
      })
      .from(tables.tag_folders)
      .leftJoin(
        tables.tag_folder_paths,
        eq(tables.tag_folders.id, tables.tag_folder_paths.descendant),
      )
*/
    let tr = await db.query.tag_folder_paths.findMany({
      where: {
        //AND: [{ ancestor: { eq: folderId } }, { depth: { gt: 0 } }],
      },

      with: {
        descendantFolder: {
          with: {
            tags: true,
            descendantPaths: true,
          },
        },
      },
    });

    let tree: { name: string; children?: { name: string }[] }[] = [];

    return tr;
  },
  { merge: "crud" },
);
