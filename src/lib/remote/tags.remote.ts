import { command, form } from "$app/server";
import { TagError, TagOptions } from "../server/tag/tag";
import { tagManager } from "../../server";
import { attempt } from "$lib/util/attempt";
import { logger } from "$lib/server/pino/logger";
import { error } from "@sveltejs/kit";

export const updateTag = form(TagOptions.zodSchema, async (data) => {
  // ... perform server-side logic with validatedData ...
  //return { success: true, message: `User ${validatedData.name} created.` };
  let result = await attempt(() => tagManager.updateTag(data.path, data));
  if ("error" in result) {
    logger.error(result.error);
    error(500, result.error.message);
  }

  result.data?.triggerEmit();
  return result.data?.getEmitPayload();
});
