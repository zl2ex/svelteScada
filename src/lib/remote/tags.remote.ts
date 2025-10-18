import { command, form } from "$app/server";
import { TagOptions } from "../server/tag/tag";
import { tagManager } from "../../server";
import { attempt } from "$lib/util/attempt";
import { logger } from "$lib/server/pino/logger";

export const updateTag = form(TagOptions.zodSchema, async (data) => {
  console.debug(data);
  // ... perform server-side logic with validatedData ...
  //return { success: true, message: `User ${validatedData.name} created.` };
  let result = attempt(() => tagManager.updateTag(data.path, data));
  if ("error" in result) {
    logger.error(result.error);
    return result.error;
  }

  return result.data;
});
