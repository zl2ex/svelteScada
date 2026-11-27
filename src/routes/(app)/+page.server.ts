import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { assertCan } from "$lib/server/auth/authorize";
import { projectManager } from "$lib/server/project/projectManager";
import { neverThrowErrorToString } from "$lib/util/neverThrow";

/**
 * Load all projects for the home page, sorted by name.
 *
 * @param locals - the request locals containing the user's ability
 * @returns the projects sorted alphabetically by name
 * @throws {HttpError} when the project list cannot be read (status 500)
 */
export const load: PageServerLoad = async ({ locals }) => {
  assertCan(locals.ability, "read", "Project");

  const projects = projectManager.getAll();
  if (projects.isErr()) error(500, neverThrowErrorToString(projects.error));

  return {
    projects: projects.value.sort((a, b) => a.name.localeCompare(b.name)),
  };
};
