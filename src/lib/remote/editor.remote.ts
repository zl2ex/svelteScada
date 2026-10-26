import { query } from "$app/server";
import z from "zod";
import { pageElementManager } from "$lib/server/page/pageElementManager";
import { wireErr, wireOk } from "$lib/util/neverThrow";

const z_projectId = z.string().min(1);

export const getProjectElements = query(z_projectId, async (projectId) => {
  const result = pageElementManager.listForProject(projectId);
  if (result.isErr()) return wireErr(result.error);
  return wireOk(result.value);
});
