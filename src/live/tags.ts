import { type TagSelect } from "$lib/sqlite/tables";
import { guard, getPlatform, live, LiveError } from "svelte-realtime/server";
import { tagManager, udtManager } from "../hooks.server";
import {
  type ClientTagValue,
  type FailedTag,
  type TagOptionsInput,
  type TagValue,
} from "$lib/server/tag/tag";

import { err, ok, type Result } from "neverthrow";
import { logger } from "$lib/server/pino/logger";
import type { PatchOp, PatchPayload } from "$lib/client/live/patchCollection.svelte";
import { wireErr, wireOk, type NeverThrowError, type WireResult } from "$lib/util/neverThrow";
import { assertLiveCan } from "$lib/server/auth/authorize";
import { tagValueSubject } from "$lib/permissions/ability";
import {
  publishTagReferenceUpdates,
  rewritePersistedTagReferences,
  type TagReferenceUpdateResult,
} from "$lib/server/tag/tagReferenceManager";
import { diffTagPathMappings } from "$lib/tagReferenceRewrite";

/**
 * Guard that requires an authenticated user for tag streams.
 *
 * @param ctx - The live request context.
 * @throws {LiveError} when no user is authenticated.
 */
export const _guard = guard((ctx) => {
  if (!ctx.user) throw new LiveError("UNAUTHENTICATED", "Must be logged in");
});

/**
 * Live stream of tag patch batches.
 *
 * Replays prior patches on subscribe so late clients converge.
 *
 * @returns an empty initial patch payload.
 */
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

/**
 * Applies a single tag patch (add, replace, or remove).
 *
 * Changing a tag's write level requires manage permission, and replacing a
 * tag rewrites persisted references when its path changes.
 *
 * @param ctx - The live request context.
 * @param patch - The patch operation to apply.
 * @returns Ok with `{ ok: true }` on success, or Err when the tag manager rejects it.
 * @throws {LiveError} when the patch is malformed or an unexpected manager error occurs.
 */
export const applyTagPatches = live(
  async (ctx, patch: PatchOp): Promise<WireResult<{ ok: true }, FailedTag | NeverThrowError>> => {
    logger.trace(patch, "tag-patches");
    if (patch.path.length !== 1) {
      throw new LiveError(
        "INVALID_PATCH",
        `applyTagPatches() must update the entire object from the front end not single properties ${patch}`,
      );
    }

    const id = patch.path[0].toString();
    const value = patch.value as TagOptionsInput;

    const action = patch.op === "add" ? "create" : patch.op === "remove" ? "delete" : "update";
    assertLiveCan(ctx.user, action, "Tag");

    if (patch.op !== "remove") {
      const nextWriteLevel = value.writeLevel ?? "operator";
      const existing = patch.op === "replace" ? tagManager.getTagByIdOrPath(id) : undefined;
      const previousWriteLevel =
        existing?.isOk() && existing.value.isOk()
          ? existing.value.value.options.writeLevel
          : existing?.isOk() && existing.value.isErr()
            ? existing.value.error.options?.writeLevel
            : undefined;

      if (previousWriteLevel !== nextWriteLevel) {
        // Changing a tag's operational access level is an admin-only action.
        assertLiveCan(ctx.user, "manage", "User");
      }
    }

    let childIdsBefore: string[] = [];
    if (patch.op !== "add") {
      childIdsBefore = tagManager.getSubtreeOptions(id).map((options) => options.id);
    }
    const pathsBefore = patch.op === "replace" ? tagManager.getAllTagPaths() : null;

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
            return wireErr(result.error);
          case "TAG_CONFIG_ERROR":
            // if its just a config issue dont fail the patch but inform the client
            publishTagValue(err(result.error));
            break;
          default:
            logger.error(reason);
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
            return wireErr(result.error);

          default:
            logger.error(reason);
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
            return wireErr(result.error);
          case "TAG_CONFIG_ERROR":
            // if its just a config issue dont fail the patch but inform the client
            publishTagValue(err(result.error));
            break;

          default:
            logger.error(reason);
            throw new LiveError("SERVER_ERROR");
        }
      }
    }

    let referenceUpdates: TagReferenceUpdateResult | undefined;
    if (pathsBefore) {
      const mappings = diffTagPathMappings(pathsBefore, tagManager.getAllTagPaths());
      if (mappings.length > 0) {
        const rewritten = rewritePersistedTagReferences(mappings, { tagManager, udtManager });
        if (rewritten.isErr()) {
          logger.error(rewritten.error);
        } else {
          referenceUpdates = rewritten.value;
        }
      }
    }

    const subtreeAfter = tagManager.getSubtreeOptions(id);
    const childIdsAfter = new Set(subtreeAfter.map((options) => options.id));
    const childPatches: PatchOp[] = [];

    if (patch.op === "add") {
      for (const childOptions of subtreeAfter) {
        childPatches.push({ op: "add", path: [childOptions.id], value: childOptions });
      }
    } else if (patch.op === "replace") {
      for (const childId of childIdsBefore) {
        if (!childIdsAfter.has(childId)) {
          childPatches.push({ op: "remove", path: [childId] });
        }
      }
      for (const childOptions of subtreeAfter) {
        childPatches.push({
          op: childIdsBefore.includes(childOptions.id) ? "replace" : "add",
          path: [childOptions.id],
          value: childOptions,
        });
      }
    } else {
      for (const childId of childIdsBefore) {
        childPatches.push({ op: "remove", path: [childId] });
      }
    }

    ctx.publish("tag-patches", "created", { patches: [patch, ...childPatches] });
    if (referenceUpdates) publishTagReferenceUpdates(ctx, referenceUpdates);

    return wireOk({ ok: true });
  },
);

// The map stores `Tag | FailedTag`; mirror that union to the client as a
// neverthrow-style `ok` / `err` value - the err side carries the error and
// the options the user can change to fix it.
//
// NOTE: keep the init callback as the second argument with nothing but
// whitespace before it - the svelte-realtime codegen parses the stream
// value type textually from its return annotation.
/**
 * Live stream of a single tag's client value, keyed by id or path.
 *
 * @param ctx - The live request context.
 * @param lookup - The tag id or full tag path.
 * @returns Ok with the client tag value, or Err when the tag is missing or failed.
 */
export const getTagValue = live.stream(
  (ctx, lookup: string) => `tag-values:${lookup}`,
  async (
    ctx,
    lookup: string,
  ): Promise<
    WireResult<ClientTagValue, FailedTag | { reason: "TAG_NOT_FOUND"; cause: string }>
  > => {
    assertLiveCan(ctx.user, "read", "TagValue");
    const tag = tagManager.getTagByIdOrPath(lookup);

    if (tag.isErr()) return wireErr(tag.error);
    if (tag.value.isErr()) return wireErr(tag.value.error);
    return wireOk(tag.value.value.getClientValueTag());
  },
  { merge: "set" },
);

/**
 * Publishes a tag value to the tag-value stream under both its id and path.
 *
 * @param tag - The client tag value or failure wrapped in a neverthrow Result.
 * @param [ctx] - Publish context; when omitted the global platform is used.
 */
export function publishTagValue(tag: Result<ClientTagValue, FailedTag>, ctx?: any) {
  let id: string | undefined = undefined;
  let wireTag: WireResult<ClientTagValue, FailedTag>;
  if (tag.isOk()) {
    id = tag.value.id;
    wireTag = wireOk(tag.value);
  } else {
    id = tag.error.options?.id;
    wireTag = wireErr(tag.error);
  }

  if (!id) {
    logger.error(`publishTagValue() id undefined`);
    return;
  }

  const path = tag.isOk() ? tag.value.path : tagManager.idToPath(id);

  //logger.trace(wireTag, `tag-values:${id}`);

  if (ctx) {
    ctx.publish(`tag-values:${id}`, "set", wireTag);
    ctx.publish(`tag-values:${path}`, "set", wireTag);
    return;
  }

  // see publishDeviceStatus() - startup publishes precede platform capture
  const platform = getPlatform();
  if (!platform) {
    logger.debug(`[publishTagValue] ${id} skipped, realtime platform not captured yet`);
    return;
  }
  platform.publish(`tag-values:${id}`, "set", wireTag);
  platform.publish(`tag-values:${path}`, "set", wireTag);
}

/**
 * Writes a value to a tag after checking the caller's write permission.
 *
 * @param ctx - The live request context.
 * @param lookup - The tag id or path; undefined is rejected.
 * @param value - The value to write.
 * @returns Ok with `{ success: true }` on success, or Err on invalid lookup or write failure.
 */
export const writeTagValue = live(
  async (
    ctx,
    { lookup, value }: { lookup: string | undefined; value: TagValue },
  ): Promise<WireResult<{ success: true }, NeverThrowError>> => {
    if (!lookup) {
      return wireErr({
        reason: "INVALID_TAG_LOOKUP",
        cause: "writeTagValue() lookup undefined ",
      } as const satisfies NeverThrowError);
    }

    const tag = tagManager.getTagByIdOrPath(lookup);
    if (tag.isErr()) {
      return wireErr(tag.error);
    }

    if (tag.value.isErr()) {
      return wireErr({
        reason: "TAG_ERROR",
        cause: tag.value.error,
      } as const satisfies NeverThrowError);
    }

    const tagOk = tag.value;
    assertLiveCan(ctx.user, "write", tagValueSubject(tagOk.value.options.writeLevel ?? "operator"));
    const update = await tagOk.value.write(value);
    if (update.isErr()) {
      return wireErr(update.error);
    }

    // TD WIP tag.write() should do this
    //publishTagValue(ok(tagOk.value.getClientValueTag()), ctx);

    return wireOk({ success: true });
  },
);
