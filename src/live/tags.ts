import { db } from "$lib/server/sqlite/db";
import { tables, type TagSelect } from "$lib/server/sqlite/tables";
import { eq } from "drizzle-orm";
import { live } from "svelte-realtime/server";
import type { TravelPatches } from "travels";
import { tagManager } from "../hooks.server";

export const tagPatches = live.stream("tag-patches", async () => null, {
  merge: "set",
  replay: true,
});

export const applyTagPatches = live(
  async (ctx, patches: TravelPatches["patches"][number]) => {
    for (const patch of patches) {
      const id = patch.path[0].toString();
      const value = patch.value as TagSelect;

      if (patch.op === "add") {
        tagManager.createTag(value);
      } else if (patch.op === "remove") {
        tagManager.deleteTag(id);
      } else if (patch.op === "replace") {
        tagManager.updateTag(id, value);
      }
    }

    ctx.publish("tag-patches", "created", { patches });
  },
);
