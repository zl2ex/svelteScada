import { eq } from "drizzle-orm";
import { command, form, query } from "$app/server";
import { attempt } from "$lib/util/attempt";
import { logger } from "$lib/server/pino/logger";
import { error, invalid } from "@sveltejs/kit";
import { TagError } from "$lib/server/tag/tag";
import z from "zod";
import { Z_tagOptionsInputForm } from "$lib/client/tag/zodSchema";
import { tryCatch } from "$lib/util/tryCatch";
import { tagManager } from "../../hooks.server";
import { tagClosureTable } from "$lib/server/sqlite/tagClosureTable";
import { db } from "$lib/server/sqlite/db";
import { tag as tagTable } from "$lib/server/sqlite/tables";

export const updateTagCommand = command(Z_tagOptionsInputForm, async (data) => {
  let result = await tryCatch(tagManager.updateTag, data.path, data);
  if (result.error) {
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

export const createFolder = command(
  z.object({
    name: z.string().min(1),
    parentId: z.string().nullable(),
  }),
  async (data) => {
    const folder = tagClosureTable.insertNode(data.name, data.parentId);
    return folder;
  },
);

export const deleteFolderCmd = command(z.string(), async (id) => {
  tagClosureTable.deleteCascade(id);
});

export const moveFolder = command(
  z.object({
    id: z.string(),
    newParentId: z.string(),
  }),
  async (data) => {
    tagClosureTable.moveNode(data.id, data.newParentId);
  },
);

export const deleteTagFromDb = command(z.string(), async (id) => {
  db.delete(tagTable).where(eq(tagTable.id, id)).run();
});

export const insertTag = command(
  z.object({
    name: z.string().min(1),
    folderId: z.string(),
    dataType: z.string(),
    nodeId: z.string().nullable().optional(),
    writeable: z.boolean().optional(),
    exposeOverOpcua: z.boolean().optional(),
    parameters: z.any().nullable().optional(),
  }),
  async (data) => {
    const result = db
      .insert(tagTable)
      .values({
        name: data.name,
        folderId: data.folderId,
        dataType: data.dataType,
        nodeId: data.nodeId ?? null,
        writeable: data.writeable ?? true,
        exposeOverOpcua: data.exposeOverOpcua ?? true,
        parameters: data.parameters ?? null,
      })
      .returning()
      .get();
    return result;
  },
);
