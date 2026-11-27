import { guard, live, LiveError } from "svelte-realtime/server";
import { logger } from "$lib/server/pino/logger";
import type { PatchOp, PatchPayload } from "$lib/client/live/patchCollection.svelte";
import { userThemeManager } from "$lib/server/theme/userThemeManager";
import type { UserThemeSelect } from "$lib/sqlite/tables";
import { assertLiveCan } from "$lib/server/auth/authorize";
import { wireErr, wireOk, type NeverThrowError, type WireResult } from "$lib/util/neverThrow";

/**
 * Guard that requires an authenticated user who can read projects.
 *
 * @param ctx - The live request context.
 * @throws {LiveError} when no user is authenticated.
 */
export const _guard = guard((ctx) => {
  if (!ctx.user) throw new LiveError("UNAUTHENTICATED", "Must be logged in");
  assertLiveCan(ctx.user, "read", "Project");
});

/**
 * Live stream of user theme patch batches.
 *
 * Replays prior patches on subscribe so late clients converge.
 *
 * @returns an empty initial patch payload.
 */
export const userThemePatches = live.stream(
  "user-theme-patches",
  async (): Promise<PatchPayload> => ({ patches: [] }),
  {
    merge: "set",
    replay: true,
  },
);

/**
 * Applies a single user theme patch (add, replace, or remove).
 *
 * @param ctx - The live request context.
 * @param patch - The patch operation to apply.
 * @returns Ok with `{ ok: true }` on success, or Err from the theme manager.
 * @throws {LiveError} when the patch does not target a whole theme object.
 */
export const applyUserThemePatches = live(
  async (ctx, patch: PatchOp): Promise<WireResult<{ ok: true }, NeverThrowError>> => {
    logger.trace(patch, "user-theme-patches");
    if (patch.path.length !== 1) {
      throw new LiveError(
        "INVALID_PATCH",
        "applyUserThemePatches() must update entire theme objects",
      );
    }

    const id = patch.path[0].toString();
    const value = patch.value as UserThemeSelect;
    const action = patch.op === "add" ? "create" : patch.op === "remove" ? "delete" : "update";
    assertLiveCan(ctx.user, action, "Project");

    let published = patch;
    if (patch.op === "add") {
      const result = userThemeManager.create({
        id,
        name: value.name,
        projectStyle: value.projectStyle,
      });
      if (result.isErr()) return wireErr(result.error);
      published = { op: "add", path: [id], value: result.value };
    } else if (patch.op === "replace") {
      const result = userThemeManager.replace(id, {
        name: value.name,
        projectStyle: value.projectStyle,
      });
      if (result.isErr()) return wireErr(result.error);
      published = { op: "replace", path: [id], value: result.value };
    } else if (patch.op === "remove") {
      const result = userThemeManager.delete(id);
      if (result.isErr()) return wireErr(result.error);
    }

    ctx.publish("user-theme-patches", "created", { patches: [published] });
    return wireOk({ ok: true });
  },
);
