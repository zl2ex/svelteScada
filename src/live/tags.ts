import { type TagSelect } from "$lib/server/sqlite/tables";
import { guard, live, LiveError, publish } from "svelte-realtime/server";
import { tagManager } from "../hooks.server";
import type { Tag } from "$lib/server/tag/tag";
import type {
  StatusCodeName,
  TagValueState,
} from "$lib/server/tag/tagValueState";
import { logger } from "$lib/server/pino/logger";
import type { PatchOp } from "$lib/client/live/patchCollection.svelte";
export type { TagValueState };

export const _guard = guard((ctx) => {
  if (!ctx.user) throw new LiveError("UNAUTHENTICATED", "Must be logged in");
});

export const tagPatches = live.stream("tag-patches", async () => null, {
  merge: "set",
  replay: true,
});

// One op per call: the client batches ops by calling this once per op, so a
// failed op is rolled back individually instead of leaving the server
// mid-way through an array.
export const applyTagPatches = live(async (ctx, patch: PatchOp) => {
  logger.trace(patch);
  if (patch.path.length !== 1) {
    throw Error(
      `applyTagPatches() must update the entire object from the front end not single properties ${patch}`,
    );
  }

  const id = patch.path[0].toString();
  const value = patch.value as TagSelect;

  if (patch.op === "add") {
    const result = tagManager.createTag(value);
    if (result.isErr()) {
      const error = result.error;
      const reason = error.reason;
      const cause = "cause" in error ? error.cause : undefined;
      console.error(error);
      switch (reason) {
        case "DB_ERROR":
        case "FOLDER_NOT_FOUND":
        case "DUPLICATE_TAG":
        case "TAG_ALREADY_EXISTS":
          throw new LiveError(reason, reason);

        default:
          throw Error(reason satisfies never, { cause });
      }
    }
  } else if (patch.op === "remove") {
    const result = tagManager.deleteTag(id);
    if (result.isErr()) {
      const error = result.error;
      const reason = error.reason;
      const cause = "cause" in error ? error.cause : undefined;
      console.error(error);
      switch (reason) {
        case "DB_ERROR":
        case "TAG_NOT_FOUND":
          throw new LiveError(reason, reason);

        default:
          throw Error(reason satisfies never, { cause });
      }
    }
  } else if (patch.op === "replace") {
    const result = tagManager.updateTag(id, value);
    if (result.isErr()) {
      const error = result.error;
      const reason = error.reason;
      const cause = "cause" in error ? error.cause : undefined;
      console.error(error);
      switch (reason) {
        case "DB_ERROR":
        case "OPCUA_FOLDER_NOT_FOUND":
        case "DUPLICATE_TAG":
          throw new LiveError(reason, reason);

        default:
          throw Error(reason satisfies never, { cause });
      }
    }
  }

  ctx.publish("tag-patches", "created", { patches: [patch] });
});

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
    if (!tag) throw new LiveError("NOT_FOUND", `Tag not found: ${id}`);

    tag.update(value);

    publishTagValue(tag, ctx);

    return { success: true };
  },
);
