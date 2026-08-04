import { type ClosureTableNode } from "$lib/server/sqlite/util/tagClosureTable";
import { guard, live, LiveError } from "svelte-realtime/server";
import type { TravelPatches } from "travels";
import { folderManager } from "../hooks.server";

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

export const applyTagFolderPatches = live(
  async (ctx, patches: TravelPatches["patches"][number]) => {
    //const versions = await applyAndPersistTagPatches(patches);

    for (const patch of patches) {
      console.debug(patch);
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
          const reason = result.error.reason;
          switch (reason) {
            case "DB_ERROR":
            case "OPCUA_FOLDER_CREATE_FAILED":
              throw new LiveError(reason, reason);

            default:
              throw Error(reason satisfies never, {
                cause: result.error.cause,
              });
          }
        }
      }
      if (patch.op == "remove") {
        const result = folderManager.deleteFolder(id);
        if (result.isErr()) {
          const reason = result.error.reason;
          switch (reason) {
            case "DB_ERROR":
            case "FOLDER_NOT_FOUND":
              throw new LiveError(reason, reason);

            default:
              throw Error(reason satisfies never, {
                cause: result.error.cause,
              });
          }
        }
      }
      if (patch.op == "replace") {
        let opcuaFolder = folderManager.get(id);
        if (!opcuaFolder)
          throw new LiveError(
            "FOLDER_NOT_FOUND",
            `cannot find folder with id ${id}`,
          );

        //only move if it has actually moved
        if (opcuaFolder.node.parentId !== value.parentId) {
          const result = folderManager.moveFolder(
            id,
            value.parentId ?? undefined,
          );
          if (result.isErr()) {
            const reason = result.error.reason;
            switch (reason) {
              case "DB_ERROR":
              case "FOLDER_NOT_FOUND":
                throw new LiveError(reason, reason);

              default:
                throw Error(reason satisfies never, {
                  cause: result.error.cause,
                });
            }
          }
        }

        if (opcuaFolder.node.name !== value.name) {
          const result = folderManager.renameFolder(id, value.name);
          if (result.isErr()) {
            const reason = result.error.reason;
            switch (reason) {
              case "DB_ERROR":
              case "FOLDER_NOT_FOUND":
              case "OPCUA_RENAME_FAILED":
                throw new LiveError(reason, reason);

              default:
                throw Error(reason satisfies never, {
                  cause: result.error.cause,
                });
            }
          }
        }
      }
    }
    ctx.publish("tag-folder-patches", "created", { patches });
  },
);
