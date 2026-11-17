import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { assertCan } from "$lib/server/auth/authorize";
import { pageManager } from "$lib/server/page/pageManager";
import { projectManager } from "$lib/server/project/projectManager";
import { neverThrowErrorToString } from "$lib/util/neverThrow";

export const load: PageServerLoad = async ({ locals, params }) => {
  assertCan(locals.ability, "read", "Project");
  assertCan(locals.ability, "read", "Page");

  const project = projectManager.getByName(params.projectName);
  if (project.isErr()) {
    if (project.error.reason === "PROJECT_NOT_FOUND") error(404, project.error.cause);
    error(500, neverThrowErrorToString(project.error));
  }

  const pages = pageManager.getAllForProject(project.value.id);
  if (pages.isErr()) error(500, neverThrowErrorToString(pages.error));

  return {
    project: project.value,
    pages: pages.value.sort(
      (a, b) => a.sortIndex - b.sortIndex || a.name.localeCompare(b.name),
    ),
  };
};
