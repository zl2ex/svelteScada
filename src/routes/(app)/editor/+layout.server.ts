import {
  tagFoldersClosureTable,
  type ClosureTableNode,
} from "$lib/server/sqlite/util/tagClosureTable";
import { projectManager } from "$lib/server/project/projectManager";
import { pageManager } from "$lib/server/page/pageManager";
import { userComponentManager } from "$lib/server/page/userComponentManager";
import { userThemeManager } from "$lib/server/theme/userThemeManager";
import type { PageRecord } from "$lib/elements/pageTypes";
import { assertCan } from "$lib/server/auth/authorize";
import { udtManager } from "../../../hooks.server";

export async function load({ locals }) {
  assertCan(locals.ability, "manage", "Project");
  const folderResult = tagFoldersClosureTable.getAll();
  if (folderResult.isErr()) throw folderResult.error;
  const folderRows = folderResult.value;

  const projects = projectManager.getAll();
  if (projects.isErr()) throw projects.error;
  const pages = pageManager.getAll();
  if (pages.isErr()) throw pages.error;
  const userComponents = userComponentManager.getDefinitions();
  if (userComponents.isErr()) throw userComponents.error;
  const themes = userThemeManager.getAll();
  if (themes.isErr()) throw themes.error;
  const udts = udtManager.getAllUdts().map((udt) => udt.toInput());

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

    themes: themes.value,

    udts,
  };
}
