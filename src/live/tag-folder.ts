import {
  ClosureTable,
  tagClosureTable,
  type ClosureTableNode,
} from "$lib/server/sqlite/tagClosureTable";
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

    patches.forEach(async (patch) => {
      console.debug(patch);
      const id = patch.path[0].toString();
      const value = patch.value as ClosureTableNode;
      if (patch.op == "add") {
        tagClosureTable.insertNode(value, value.parentId);
      }
      if (patch.op == "remove") {
        tagClosureTable.deleteCascade(id);
      }
      if (patch.op == "replace") {
        let node = await tagClosureTable.getNode(id);
        if (!node) throw Error(`cannot find node with id ${id} in table`);

        if (node.parentId !== value.parentId) {
          if (!value.parentId)
            throw Error(`cannot move node ${id} to undefined parent`);
          tagClosureTable.moveNode(id, value.parentId);
        }

        if (node.name !== value.name) {
          tagClosureTable.renameNode(id, value.name);
        }
      }
    });
    ctx.publish("tag-folder-patches", "created", { patches });
  },
);
