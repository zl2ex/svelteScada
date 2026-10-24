import { tagManager } from "../../hooks.server";
import type { TagOptionsInput } from "$lib/server/tag/tag";

export async function load({ locals }) {
  const allTags = tagManager.getAllTags();
  const tagRows = allTags.map((tag) => {
    if (tag.isErr()) return tag.error.options;
    return tag.value.options;
  });

  const tagPaths = tagRows.reduce(
    (map, tag) => {
      const path = tagManager.idToPath(tag.id);
      if (path) map[tag.id] = path;
      return map;
    },
    {} as Record<string, string>,
  );

  return {
    user: locals.user,
    tags: tagRows.reduce(
      (map, tag) => {
        map[tag.id] = tag;
        return map;
      },
      {} as Record<string, TagOptionsInput>,
    ),
    tagPaths,
  };
}
