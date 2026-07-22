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
        folderManager.createFolder(value);
      }
      if (patch.op == "remove") {
        folderManager.deleteFolder(id);
      }
      if (patch.op == "replace") {
        let opcuaFolder = folderManager.get(id);
        if (!opcuaFolder)
          throw Error(`cannot find node with id ${id} in table`);

        //only move if it has actually moved
        if (opcuaFolder.node.parentId !== value.parentId) {
          folderManager.moveFolder(id, value.parentId ?? undefined);
        }

        if (opcuaFolder.node.name !== value.name) {
          folderManager.renameFolder(id, value.name);
        }
      }
    }
    ctx.publish("tag-folder-patches", "created", { patches });
  },
);
