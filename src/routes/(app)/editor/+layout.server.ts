import {
  tagFoldersClosureTable,
  type ClosureTableNode,
} from "$lib/server/sqlite/util/tagClosureTable";
import type { TagOptionsInput } from "$lib/server/tag/tag";
import { tagManager } from "../../../hooks.server";

export async function load() {
  const folderResult = tagFoldersClosureTable.getAll();
  if (folderResult.isErr()) throw folderResult.error;
  const folderRows = folderResult.value;
  const tagRows = tagManager.getAllTags().map((t) => t.options);
  return {
    tagFolders: folderRows.reduce(
      (map, folder) => {
        map[folder.id] = folder;
        return map;
      },
      {} as Record<string, ClosureTableNode>,
    ),

    tags: tagRows.reduce(
      (map, tag) => {
        map[tag.id] = tag;
        return map;
      },
      {} as Record<string, TagOptionsInput>,
    ),
  };
}
