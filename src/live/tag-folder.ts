import { db } from "$lib/server/sqlite/db";
import {
  tagClosureTable,
  type ClosureTableNode,
} from "$lib/server/sqlite/tagClosureTable";
import { live, LiveError } from "svelte-realtime/server";
import type { Patch } from "mutative";
import z from "zod";
import type { TagFolder } from "$lib/server/sqlite/tables";

let count = 0;

export const increment = live((ctx) => {
  count++;
  ctx.publish("count", "set", count);
  return count;
});

export const counter = live.stream(
  "count",
  (ctx) => {
    return count;
  },
  { merge: "set" },
);

export const tagFolder = live.stream(
  "tag-folder",
  async (ctx): Promise<ClosureTableNode[]> => {
    //return await getSubTree("root");
    return await tagClosureTable.getTree();
  },
  { merge: "crud", key: "id" },
);

// const z_updateFolder = z.object({
//   z.
// })

export const updateFolder = live((ctx, patch: Patch) => {
  console.debug(patch);

  // if (patch.path[0] !== "tag-folders") {
  //   throw Error(
  //     `updateFolder() patch path ${patch.path[0]} is not equal to "tag-folders"`,
  //   );
  //

  if (patch.op === "replace") {
    //tagClosureTable.
  }
  if (patch.op === "add") {
    tagClosureTable.insertNode(patch?.value, null);
  }
  if (patch.op === "remove") {
    tagClosureTable.deleteCascade(patch?.value.id);
  }
});
