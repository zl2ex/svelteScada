import { getRequestEvent, query } from "$app/server";
import z from "zod";
import { pageElementManager } from "$lib/server/page/pageElementManager";
import { wireErr, wireOk } from "$lib/util/neverThrow";
import { assertCan } from "$lib/server/auth/authorize";

const z_projectId = z.string().min(1);

/**
 * Queries the elements belonging to a project.
 *
 * @param projectId - The project whose elements are listed.
 * @returns Ok with the project elements, or Err from the element manager.
 */
export const getProjectElements = query(z_projectId, async (projectId) => {
  assertCan(getRequestEvent().locals.ability, "read", "Project");
  const result = pageElementManager.listForProject(projectId);
  if (result.isErr()) return wireErr(result.error);
  return wireOk(result.value);
});
