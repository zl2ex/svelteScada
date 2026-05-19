import { command, form, query } from "$app/server";
import { udtManager } from "../../server";
import { attempt } from "$lib/util/attempt";
import { logger } from "$lib/server/pino/logger";
import { error, invalid } from "@sveltejs/kit";
import { TagError } from "$lib/server/tag/tag";
import z from "zod";
import { TagNode } from "$lib/client/tag/clientTag.svelte";
import { Z_UdtDefinitionOptions } from "$lib/server/tag/udt";

export const getUdt = query(z.string(), (name) => {
  const result = attempt(() => udtManager.getUdt(name));
  if ("error" in result) error(500, result.error.message);
  if (!result.data) error(404, `Error no udt found at ${name}`);
  return result.data.options;
});

export const updateUdt = form(Z_UdtDefinitionOptions, async (data, issue) => {
  // ... perform server-side logic with validatedData ...
  //return { success: true, message: `User ${validatedData.name} created.` };

  let result = await attempt(() => udtManager.updateUdt(data.path, data));
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
  return result.data?.getEmitPayload();
});

export const deleteUDt = command(z.string().nonempty(), async (path) => {
  let result = await attempt(() => udtManager.delteUdt(path));
  if ("error" in result) {
    logger.error(result.error);
    error(500, result.error.message);
  }
  // refresh udt tree
  getAllUdtsAsNode("/").refresh();
});

export const getAllUdtsAsNode = query(z.string(), async (path) => {
  let result = attempt(() => udtManager.getAllUdts());
  if ("error" in result) {
    logger.error(result.error);
    error(500, result.error.message);
  }

  let nodes = result.data.map((udtDef) => {
    return { name: udtDef.name, parentPath: "/udts", type: "UdtTag" };
  });

  return nodes;
});
