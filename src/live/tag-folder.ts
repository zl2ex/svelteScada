import { type ClosureTableNode } from "$lib/server/sqlite/util/tagClosureTable";
import { guard, live, LiveError } from "svelte-realtime/server";
import { folderManager } from "../hooks.server";
import { logger } from "$lib/server/pino/logger";
import type {
  PatchOp,
  PatchPayload,
} from "$lib/client/live/patchCollection.svelte";
import { err, ok, type Result } from "neverthrow";
import type { NeverThrowError } from "$lib/util/neverThrow";

export const _guard = guard((ctx) => {
  if (!ctx.user) throw new LiveError("UNAUTHENTICATED", "Must be logged in");
});

// TD WIP TYPE return
// TravelPatches["patches"][number]
export const tagFolderPatches = live.stream(
  "tag-folder-patches",
  async (): Promise<PatchPayload> => ({ patches: [] }),
  {
    merge: "set",
    replay: true,
  },
);

// One op per call: the client batches ops by calling this once per op, so a
// failed op is rolled back individually instead of leaving the server
// mid-way through an array.
//

export const applyTagFolderPatches = live(
  async (
    ctx,
    patch: PatchOp,
  ): Promise<Result<{ ok: true }, NeverThrowError>> => {
    logger.trace(patch);
    if (patch.path.length !== 1) {
      throw new LiveError(
        "INVALID_PATCH",
        `applyTagFolderPatches() must update the entire object from the front end not single properties ${patch}`,
      );
    }
    const id = patch.path[0].toString();
    const value = patch.value as ClosureTableNode;
    if (patch.op == "add") {
      const result = folderManager.createFolder(value);
      if (result.isErr()) {
        console.error(result.error);
        return err(result.error);
      }
    }
    if (patch.op == "remove") {
      const result = folderManager.deleteFolder(id);
      if (result.isErr()) {
        console.error(result.error);
        return err(result.error);
      }
    }
    if (patch.op == "replace") {
      const opcuaFolder = folderManager.get(id);
      if (!opcuaFolder) {
        console.error("FOLDER_NOT_FOUND", `cannot find folder with id ${id}`);
        return err({
          reason: "FOLDER_NOT_FOUND",
          cause: `cannot find folder with id ${id}`,
        } as const);
      }

      //only move if it has actually moved
      if (opcuaFolder.node.parentId !== value.parentId) {
        const result = folderManager.moveFolder(
          id,
          value.parentId ?? undefined,
        );
        if (result.isErr()) {
          console.error(result.error);
          return err(result.error);
        }
      }

      if (opcuaFolder.node.name !== value.name) {
        const result = folderManager.renameFolder(id, value.name);
        if (result.isErr()) {
          console.error(result.error);
          return err(result.error);
        }
      }
    }

    ctx.publish("tag-folder-patches", "created", { patches: [patch] });
    return ok({ ok: true });
  },
);
