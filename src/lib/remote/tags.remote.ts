import { command, form, query } from "$app/server";
import { tagManager } from "../../server";
import { attempt } from "$lib/util/attempt";
import { logger } from "$lib/server/pino/logger";
import { error, invalid } from "@sveltejs/kit";
import { TagError, Z_tagOptionsInputForm } from "$lib/server/tag/tag";
import z from "zod";
import { Node } from "$lib/client/tag/clientTag.svelte";

export const updateTag = form(Z_tagOptionsInputForm, async (data, issue) => {
  // ... perform server-side logic with validatedData ...
  //return { success: true, message: `User ${validatedData.name} created.` };

  let result = await attempt(() => tagManager.updateTag(data.path, data));
  if ("error" in result) {
    logger.error(result.error);
    //error(500, result.error.message);
    if (result.error instanceof TagError) {
      invalid(
        issue[result.error.feildName as keyof typeof issue](
          result.error.message
        )
      );
    } else {
      invalid(result.error.message);
    }
  }

  result.data?.triggerEmit();
  return result.data?.getEmitPayload();
});

export const deleteTag = command(z.string().nonempty(), async (path) => {
  let result = await attempt(() => tagManager.deleteTag(path));
  if ("error" in result) {
    logger.error(result.error);
    error(500, result.error.message);
  }
  // refresh tag tree
  getChildrenAsNode("/").refresh();
});

export const getChildrenAsNode = query(z.string(), async (path) => {
  let result = attempt(() => tagManager.getChildrenAsNode(path));
  if ("error" in result) {
    logger.error(result.error);
    error(500, result.error.message);
  }

  return result.data;
});
