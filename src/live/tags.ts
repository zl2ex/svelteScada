import { type TagSelect } from "$lib/server/sqlite/tables";
import { guard, live, LiveError } from "svelte-realtime/server";
import type { TravelPatches } from "travels";
import { tagManager } from "../hooks.server";

export const _guard = guard((ctx) => {
  if (!ctx.user) throw new LiveError("UNAUTHENTICATED", "Must be logged in");
});

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

export interface TagValueState {
  id: string;
  name: string;
  value: unknown;
  statusCode: string;
  errorMessage: string | null;
  writeable: boolean;
}

export const tagValues = live.stream(
  (ctx, lookup: string) => `tag-values:${lookup}`,
  async (ctx, lookup: string): Promise<TagValueState> => {
    const tag =
      tagManager.getTagById(lookup) ?? tagManager.getTagByPath(lookup);
    if (!tag) throw new Error(`Tag not found: ${lookup}`);

    return {
      id: tag.id,
      name: tag.name,
      value: tag.value,
      statusCode: tag.statusCode.name,
      errorMessage: tag.error?.message ?? null,
      writeable: tag.resolvedOptions.writeable,
    };
  },
  { merge: "set" },
);

function publishTagValue(ctx: any, tag: any) {
  const state: TagValueState = {
    id: tag.id,
    name: tag.name,
    value: tag.value,
    statusCode: tag.statusCode.name,
    errorMessage: tag.error?.message ?? null,
    writeable: tag.resolvedOptions.writeable,
  };
  ctx.publish(`tag-values:${tag.id}`, "set", state);
  ctx.publish(`tag-values:${tag.path}`, "set", state);
}

export const setTagValue = live(
  async (ctx, { id, value }: { id: string; value: unknown }) => {
    const tag = tagManager.getTagById(id) ?? tagManager.getTagByPath(id);
    if (!tag) throw new Error(`Tag not found: ${id}`);

    tag.update(value);

    publishTagValue(ctx, tag);

    return { success: true };
  },
);
