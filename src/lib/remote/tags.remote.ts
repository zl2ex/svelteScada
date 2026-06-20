import { command, form, query } from "$app/server";
import { tagManager } from "../../server";
import { attempt } from "$lib/util/attempt";
import { logger } from "$lib/server/pino/logger";
import { error, invalid } from "@sveltejs/kit";
import { TagError } from "$lib/server/tag/tag";
import z from "zod";
import { Z_tagOptionsInputForm } from "$lib/client/tag/zodSchema";

export const updateTagCommand = command(Z_tagOptionsInputForm, async (data) => {
  let result = await attempt(() => tagManager.updateTag(data.path, data));
  if ("error" in result) {
    logger.error(result.error);
    error(500, result.error.message);
  }
  // refresh tag tree
  //getAllChildrenAsNode("/").refresh();
});

export const updateTag = form(Z_tagOptionsInputForm, async (data, issue) => {
  let result = await attempt(() => tagManager.updateTag(data.path, data));
  if ("error" in result) {
    logger.error(result.error);
    //error(500, result.error.message);
    if (result.error instanceof TagError) {
      invalid(
        issue[result.error.feildName as keyof typeof issue](
          result.error.message,
        ),
      );
    } else {
      invalid(result.error.message);
    }
  }

  result.data?.triggerEmit();
  getAllChildrenAsNode("/").refresh();
  return result.data?.getEmitPayload();
});

export const deleteTag = command(z.string().nonempty(), async (path) => {
  let result = await attempt(() => tagManager.deleteTag(path));
  if ("error" in result) {
    logger.error(result.error);
    error(500, result.error.message);
  }

  // let parts = path.split("/");
  // let parentPatth = "";
  // parts.forEach((part, idx) => {
  //   if (idx >= parts.length - 1) return;
  //   parentPatth += part + "/";
  // });
  // refresh tag tree
  getAllChildrenAsNode("/").refresh();
});

export const getAllChildrenAsNode = query(z.string(), async (path) => {
  let result = attempt(() => tagManager.getAllChildrenAsNode(path));
  if ("error" in result) {
    logger.error(result.error);
    error(500, result.error.message);
  }

  return result.data;
});
