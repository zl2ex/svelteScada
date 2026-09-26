import { type TagSelect } from "$lib/server/sqlite/tables";
import { guard, live, LiveError, publish } from "svelte-realtime/server";
import { tagManager } from "../hooks.server";
import {
  type ClientTagValue,
  type FailedTag,
  type TagValue,
} from "$lib/server/tag/tag";

import { err, ok, type Result } from "neverthrow";
import { logger } from "$lib/server/pino/logger";
import type {
  PatchOp,
  PatchPayload,
} from "$lib/client/live/patchCollection.svelte";
import type { NeverThrowError } from "$lib/util/neverThrow";

export const _guard = guard((ctx) => {
  if (!ctx.user) throw new LiveError("UNAUTHENTICATED", "Must be logged in");
});

export const tagPatches = live.stream(
  "tag-patches",
  async (): Promise<PatchPayload> => ({ patches: [] }),
  {
    merge: "set",
    replay: true,
  },
);

// One op per call: the client batches ops by calling this once per op, so a
// failed op is rolled back individually instead of leaving the server
// mid-way through an array.

export const applyTagPatches = live(
  async (
    ctx,
    patch: PatchOp,
  ): Promise<Result<{ ok: true }, FailedTag | NeverThrowError>> => {
    logger.trace(patch);
    if (patch.path.length !== 1) {
      throw new LiveError(
        "INVALID_PATCH",
        `applyTagPatches() must update the entire object from the front end not single properties ${patch}`,
      );
    }

    const id = patch.path[0].toString();
    const value = patch.value as TagSelect;

    if (patch.op === "add") {
      const result = tagManager.createTag(value);
      if (result.isErr()) {
        logger.error(result.error);
        const reason = result.error.reason;
        switch (reason) {
          case "DB_ERROR":
          case "DUPLICATE_TAG":
          case "FOLDER_NOT_FOUND":
          case "TAG_ALREADY_EXISTS":
          case "TAG_SERVER_NOT_INITIALISED":
          case "FOLDER_MANAGER_NOT_INITIALISED":
            return err(result.error);
          case "TAG_CONFIG_ERROR":
            // if its just a config issue dont fail the patch but inform the client
            publishTagValue(err(result.error));
            break;
          default:
            logger.error(reason satisfies never);
            throw new LiveError("SERVER_ERROR");
        }
      }
    } else if (patch.op === "remove") {
      const result = tagManager.deleteTag(id);
      if (result.isErr()) {
        logger.error(result.error);
        const reason = result.error.reason;
        switch (reason) {
          case "DB_ERROR":
          case "TAG_NOT_FOUND":
            return err(result.error);

          default:
            logger.error(reason satisfies never);
            throw new LiveError("SERVER_ERROR");
        }
      }
    } else if (patch.op === "replace") {
      const result = tagManager.updateTag(id, value);
      if (result.isErr()) {
        logger.error(result.error);
        const reason = result.error.reason;
        switch (reason) {
          case "DB_ERROR":
          case "OPCUA_FOLDER_NOT_FOUND":
          case "TAG_SERVER_NOT_INITIALISED":
          case "FOLDER_MANAGER_NOT_INITIALISED":
            return err(result.error);
          case "TAG_CONFIG_ERROR":
            // if its just a config issue dont fail the patch but inform the client
            publishTagValue(err(result.error));
            break;

          default:
            logger.error(reason satisfies never);
            throw new LiveError("SERVER_ERROR");
        }
      }
    }

    ctx.publish("tag-patches", "created", { patches: [patch] });

    return ok({ ok: true });
  },
);

// The map stores `Tag | FailedTag`; mirror that union to the client as a
// neverthrow-style `ok` / `err` value - the err side carries the error and
// the options the user can change to fix it.
//
// NOTE: keep the init callback as the second argument with nothing but
// whitespace before it - the svelte-realtime codegen parses the stream
// value type textually from its return annotation.
export const getTagValue = live.stream(
  (ctx, lookup: string) => `tag-values:${lookup}`,
  async (
    ctx,
    lookup: string,
  ): Promise<
    Result<
      ClientTagValue,
      FailedTag | { reason: "TAG_NOT_FOUND"; cause: string }
    >
  > => {
    const id = tagManager.getTagById(lookup);
    const path = tagManager.getTagByPath(lookup);
    if (id.isErr() && path.isErr()) return err(id.error);
    let tag;
    if (id.isOk()) tag = id.value;
    if (path.isOk()) tag = path.value;
    if (!tag) {
      return err({
        reason: "TAG_NOT_FOUND",
        cause: `no tag found at path or id ${lookup}`,
      } as const satisfies { reason: "TAG_NOT_FOUND"; cause: string });
    }
    if (tag.isErr()) return err(tag.error);
    return ok(tag.value.getClientValueTag());
  },
  { merge: "set" },
);

export function publishTagValue(
  tag: Result<ClientTagValue, FailedTag>,
  ctx?: any,
) {
  let id: string | undefined = undefined;
  if (tag.isOk()) {
    id = tag.value.id;
  } else {
    id = tag.error.options?.id;
  }

  if (!id) {
    logger.error(`publishTagValue() id undefined`);
    return;
  }

  const path = tagManager.idToPath(id);

  if (ctx) {
    ctx.publish(`tag-values:${id}`, "set", tag);
    ctx.publish(`tag-values:${path}`, "set", tag);
    return;
  }

  publish(`tag-values:${id}`, "set", tag);
  publish(`tag-values:${path}`, "set", tag);
}

export const writeTagValue = live(
  async (
    ctx,
    { id, value }: { id: string; value: TagValue },
  ): Promise<Result<{ success: true }, NeverThrowError>> => {
    const tag = tagManager.getTagById(id);
    if (tag.isErr()) {
      return err(tag.error);
    }

    if (tag.value.isErr()) {
      return err({
        reason: "TAG_ERROR",
        cause: tag.value.error,
      } as const satisfies NeverThrowError);
    }

    const tagOk = tag.value;
    const update = await tagOk.value.write(value);
    if (update.isErr()) {
      return err(update.error);
    }

    // TD WIP tag.write() should do this
    //publishTagValue(ok(tagOk.value.getClientValueTag()), ctx);

    return ok({ success: true });
  },
);
