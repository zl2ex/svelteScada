import { type ClosureTableNode } from "$lib/server/sqlite/util/tagClosureTable";
import { guard, live, LiveError } from "svelte-realtime/server";
import { folderManager } from "../hooks.server";
import { logger } from "$lib/server/pino/logger";
import type { PatchOp } from "$lib/client/live/patchCollection.svelte";

export const _guard = guard((ctx) => {
  if (!ctx.user) throw new LiveError("UNAUTHENTICATED", "Must be logged in");
});

// TD WIP TYPE return
// TravelPatches["patches"][number]
export const tagFolderPatches = live.stream(
  "tag-folder-patches",
  async () => null,
  {
    merge: "set",
    replay: true,
  },
);

// One op per call: the client batches ops by calling this once per op, so a
// failed op is rolled back individually instead of leaving the server
// mid-way through an array.
export const applyTagFolderPatches = live(async (ctx, patch: PatchOp) => {
  logger.trace(patch);
  if (patch.path.length !== 1) {
    throw Error(
      `applyTagFolderPatches() must update the entire object from the front end not single properties ${patch}`,
    );
  }
  const id = patch.path[0].toString();
  const value = patch.value as ClosureTableNode;
  if (patch.op == "add") {
    const result = folderManager.createFolder(value);
    if (result.isErr()) {
      const error = result.error;
      const reason = error.reason;
      const cause = "cause" in error ? error.cause : undefined;
      console.error(error);
      switch (reason) {
        case "DB_ERROR":
        case "OPCUA_FOLDER_CREATE_FAILED":
          throw new LiveError(reason, reason);

        default:
          throw Error(reason satisfies never, { cause });
      }
    }
  }
  if (patch.op == "remove") {
    const result = folderManager.deleteFolder(id);
    if (result.isErr()) {
      const error = result.error;
      const reason = error.reason;
      const cause = "cause" in error ? error.cause : undefined;
      console.error(error);
      switch (reason) {
        case "DB_ERROR":
        case "FOLDER_NOT_FOUND":
          throw new LiveError(reason, reason);

        default:
          throw Error(reason satisfies never, { cause });
      }
    }
  }
  if (patch.op == "replace") {
    let opcuaFolder = folderManager.get(id);
    if (!opcuaFolder) {
      console.error("FOLDER_NOT_FOUND", `cannot find folder with id ${id}`);

      throw new LiveError(
        "FOLDER_NOT_FOUND",
        `cannot find folder with id ${id}`,
      );
    }

    //only move if it has actually moved
    if (opcuaFolder.node.parentId !== value.parentId) {
      const result = folderManager.moveFolder(id, value.parentId ?? undefined);
      if (result.isErr()) {
        const error = result.error;
        const reason = error.reason;
        const cause = "cause" in error ? error.cause : undefined;
        console.error(error);
        switch (reason) {
          case "DB_ERROR":
          case "FOLDER_NOT_FOUND":
            throw new LiveError(reason, reason);

          default:
            throw Error(reason satisfies never, { cause });
        }
      }
    }

    if (opcuaFolder.node.name !== value.name) {
      const result = folderManager.renameFolder(id, value.name);
      if (result.isErr()) {
        const error = result.error;
        const reason = error.reason;
        const cause = "cause" in error ? error.cause : undefined;
        console.error(error);
        switch (reason) {
          case "DB_ERROR":
          case "FOLDER_NOT_FOUND":
          case "OPCUA_RENAME_FAILED":
            throw new LiveError(reason, reason);

          default:
            throw Error(reason satisfies never, { cause });
        }
      }
    }
  }
  ctx.publish("tag-folder-patches", "created", { patches: [patch] });
});
