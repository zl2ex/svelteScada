import {
  tagFoldersClosureTable,
  type ClosureTableNode,
} from "$lib/server/sqlite/util/tagClosureTable";
import { Tag, type TagOptionsInput, type TagTrendOptionsSelect } from "$lib/server/tag/tag";
import { tagManager } from "../../../hooks.server";

export async function load() {
  const folderResult = tagFoldersClosureTable.getAll();
  if (folderResult.isErr()) throw folderResult.error;
  const folderRows = folderResult.value;

  const allTags = tagManager.getAllTags();
  const tagRows = allTags.map((t) => {
    if (t.isErr()) return t.error.options;
    return t.value.options;
  });
  // trend options live in their own table so they are loaded alongside the
  // tags instead of being patched through the tag options collection
  const tagTrendRows = allTags.flatMap((t) => {
    if (t.isErr() || !t.value.options.trend) return [];
    return [t.value.options.trend];
  });

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

    tagTrendOptions: tagTrendRows.reduce(
      (map, options) => {
        map[options.tagId] = options;
        return map;
      },
      {} as Record<string, TagTrendOptionsSelect>,
    ),
  };
}
