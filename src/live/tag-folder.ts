import {
  tagFoldersClosureTable,
  type ClosureTableNode,
} from "$lib/server/sqlite/util/tagClosureTable";
import { live } from "svelte-realtime/server";
import type { TravelPatches } from "travels";

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
      if (patch.path.length !== 1)
        throw Error(
          `applyTagFolderPatches() must update the entire object from the front end not single properties ${patch}`,
        );
      const id = patch.path[0].toString();
      const value = patch.value as ClosureTableNode;
      if (patch.op == "add") {
        tagFoldersClosureTable.add(value, value.parentId);
      }
      if (patch.op == "remove") {
        tagFoldersClosureTable.deleteRecursive(id);
      }
      if (patch.op == "replace") {
        let node = tagFoldersClosureTable.get(id);
        if (!node) throw Error(`cannot find node with id ${id} in table`);

        //only move if it has actually moved
        if (node.parentId !== value.parentId) {
          //if (!value.parentId) throw Error(`cannot move node ${id} to undefined parent`);
          tagFoldersClosureTable.move(id, value.parentId ?? undefined);
        }

        if (node.name !== value.name) {
          tagFoldersClosureTable.rename(id, value.name);
        }
      }
    }
    ctx.publish("tag-folder-patches", "created", { patches });
  },
);
