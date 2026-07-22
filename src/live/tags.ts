import { type TagSelect } from "$lib/server/sqlite/tables";
import { guard, live, LiveError, publish } from "svelte-realtime/server";
import type { TravelPatches } from "travels";
import { tagManager } from "../hooks.server";
import type { Tag } from "$lib/server/tag/tag";

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
      console.debug(patch);
      if (patch.path.length !== 1) {
        throw Error(
          `applyTagFolderPatches() must update the entire object from the front end not single properties ${patch}`,
        );
      }

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
    } satisfies TagValueState;
  },
  { merge: "set" },
);

export function publishTagValue(tag: Tag<any>, ctx?: any) {
  const state: TagValueState = {
    id: tag.id,
    name: tag.name,
    value: tag.value,
    statusCode: tag.statusCode.name,
    errorMessage: tag.error?.message ?? null,
    writeable: tag.resolvedOptions.writeable,
  };

  const path = tagManager.idToPath(tag.id);

  if (ctx) {
    ctx.publish(`tag-values:${tag.id}`, "set", state);
    ctx.publish(`tag-values:${path}`, "set", state);
    return;
  }

  publish(`tag-values:${tag.id}`, "set", state);
  publish(`tag-values:${path}`, "set", state);
}

export const setTagValue = live(
  async (ctx, { id, value }: { id: string; value: unknown }) => {
    const tag = tagManager.getTagById(id) ?? tagManager.getTagByPath(id);
    if (!tag) throw new Error(`Tag not found: ${id}`);

    tag.update(value);

    publishTagValue(tag, ctx);

    return { success: true };
  },
);
