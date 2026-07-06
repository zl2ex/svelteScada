import { db } from "$lib/server/sqlite/db";
import {
  tagClosureTable,
  type ClosureTableNode,
} from "$lib/server/sqlite/tagClosureTable";

export async function load() {
  const rows = await tagClosureTable.getAll();
  return {
    tagFolders: rows.reduce(
      (map, folder) => {
        map[folder.id] = folder;
        return map;
      },
      {} as Record<string, ClosureTableNode>,
    ),
  };
}
