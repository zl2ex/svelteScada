import {
  tagFoldersClosureTable,
  type ClosureTableNode,
} from "$lib/server/sqlite/util/tagClosureTable";
import { projectManager } from "$lib/server/project/projectManager";
import { pageManager } from "$lib/server/page/pageManager";
import { userComponentManager } from "$lib/server/page/userComponentManager";
import type { PageRecord } from "$lib/page/pageTypes";

export async function load() {
  const folderResult = tagFoldersClosureTable.getAll();
  if (folderResult.isErr()) throw folderResult.error;
  const folderRows = folderResult.value;

  const projects = projectManager.getAll();
  if (projects.isErr()) throw projects.error;
  const pages = pageManager.getAll();
  if (pages.isErr()) throw pages.error;
  const userComponents = userComponentManager.getDefinitions();
  if (userComponents.isErr()) throw userComponents.error;

  return {
    tagFolders: folderRows.reduce(
      (map, folder) => {
        map[folder.id] = folder;
        return map;
      },
      {} as Record<string, ClosureTableNode>,
    ),

    projects: projects.value,

    pages: pages.value.reduce(
      (map, page) => {
        map[page.id] = page;
        return map;
      },
      {} as Record<string, PageRecord>,
    ),

    userComponents: userComponents.value,
  };
}
