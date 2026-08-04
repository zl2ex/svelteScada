import { type TagSelect } from "$lib/server/sqlite/tables";
import { guard, live, LiveError, publish } from "svelte-realtime/server";
import type { TravelPatches } from "travels";
import { tagManager } from "../hooks.server";
import type { Tag } from "$lib/server/tag/tag";
import type {
  StatusCodeName,
  TagValueState,
} from "$lib/server/tag/tagValueState";
export type { TagValueState };

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
        const result = tagManager.createTag(value);
        if (result.isErr()) {
          const reason = result.error.reason;
          switch (reason) {
            case "DB_ERROR":
            case "OPCUA_FOLDER_CREATE_FAILED":
            case "DUPLICATE_TAG":
            case "TAG_ALREADY_EXISTS":
              throw new LiveError(reason, reason);

            default:
              throw Error(reason satisfies never, {
                cause: result.error.cause,
              });
          }
        }
      } else if (patch.op === "remove") {
        const result = tagManager.deleteTag(id);
        if (result.isErr()) {
          const reason = result.error.reason;
          switch (reason) {
            case "DB_ERROR":
            case "TAG_NOT_FOUND":
              throw new LiveError(reason, reason);

            default:
              throw Error(reason satisfies never, {
                cause: result.error.cause,
              });
          }
        }
      } else if (patch.op === "replace") {
        const result = tagManager.updateTag(id, value);
        if (result.isErr()) {
          const reason = result.error.reason;
          switch (reason) {
            case "DB_ERROR":
            case "OPCUA_FOLDER_NOT_FOUND":
              throw new LiveError(reason, reason);

            default:
              throw Error(reason satisfies never, {
                cause: result.error.cause,
              });
          }
        }
      }
    }

    ctx.publish("tag-patches", "created", { patches });
  },
);

export type ClientTag = TagValueState | undefined;

export const getTagValue = live.stream(
  (ctx, lookup: string) => `tag-values:${lookup}`,
  async (ctx, lookup: string): Promise<TagValueState> => {
    const tag =
      tagManager.getTagById(lookup) ?? tagManager.getTagByPath(lookup);
    if (!tag) throw new LiveError("NOT_FOUND", `Tag not found: ${lookup}`);

    return {
      id: tag.id,
      name: tag.name,
      value: tag.value,
      statusString: tag.statusCode.name as StatusCodeName,
      errorString: tag.error?.message ?? undefined,
      options: tag.options,
    } satisfies TagValueState;
  },
  { merge: "set" },
);

export function publishTagValue(tag: Tag<any>, ctx?: any) {
  const state: TagValueState = {
    id: tag.id,
    name: tag.name,
    value: tag.value,
    statusString: tag.statusCode.name as StatusCodeName,
    errorString: tag.error?.message ?? undefined,
    options: tag.options,
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
