import { guard, live, LiveError } from "svelte-realtime/server";
import { logger } from "$lib/server/pino/logger";
import type { PatchOp, PatchPayload } from "$lib/client/live/patchCollection.svelte";
import { pageManager } from "$lib/server/page/pageManager";
import { pageElementManager } from "$lib/server/page/pageElementManager";
import type { ElementRecord } from "$lib/elements/elementTypes";
import type { PageRecord } from "$lib/elements/pageTypes";
import { wireErr, wireOk, type NeverThrowError, type WireResult } from "$lib/util/neverThrow";
import { assertLiveCan } from "$lib/server/auth/authorize";

/**
 * Guard that requires an authenticated user who can read pages.
 *
 * @param ctx - The live request context.
 * @throws {LiveError} when no user is authenticated.
 */
export const _guard = guard((ctx) => {
  if (!ctx.user) throw new LiveError("UNAUTHENTICATED", "Must be logged in");
  assertLiveCan(ctx.user, "read", "Page");
});

/**
 * Live stream of page patch batches.
 *
 * Replays prior patches on subscribe so late clients converge.
 *
 * @returns an empty initial patch payload.
 */
export const pagePatches = live.stream(
  "page-patches",
  async (): Promise<PatchPayload> => ({ patches: [] }),
  {
    merge: "set",
    replay: true,
  },
);

/**
 * Applies a single page patch (add, replace, or remove).
 *
 * Removing a page also publishes removal patches for its elements.
 *
 * @param ctx - The live request context.
 * @param patch - The patch operation to apply.
 * @returns Ok with `{ ok: true }` on success, or Err from the page manager.
 * @throws {LiveError} when the patch does not target a whole page object.
 */
export const applyPagePatches = live(
  async (ctx, patch: PatchOp): Promise<WireResult<{ ok: true }, NeverThrowError>> => {
    logger.trace(patch, "page-patches");
    if (patch.path.length !== 1) {
      throw new LiveError("INVALID_PATCH", "applyPagePatches() must update entire page objects");
    }

    const id = patch.path[0].toString();
    const value = patch.value as PageRecord;
    const action = patch.op === "add" ? "create" : patch.op === "remove" ? "delete" : "update";
    assertLiveCan(ctx.user, action, "Page");
    let published = patch;

    if (patch.op === "add") {
      const result = pageManager.create({
        id,
        projectId: value.projectId,
        name: value.name,
        sortIndex: value.sortIndex,
      });
      if (result.isErr()) return wireErr(result.error);
      published = {
        op: "add",
        path: [id],
        value: result.value,
      };
    } else if (patch.op === "replace") {
      const result = pageManager.replace(id, {
        name: value.name,
        sortIndex: value.sortIndex,
      });
      if (result.isErr()) return wireErr(result.error);
      published = {
        op: "replace",
        path: [id],
        value: result.value,
      };
    } else if (patch.op === "remove") {
      const elements = pageElementManager.list({ type: "page", pageId: id });
      const result = pageManager.delete(id);
      if (result.isErr()) return wireErr(result.error);
      if (elements.isOk() && Object.keys(elements.value).length > 0) {
        ctx.publish(`page-elements:${id}`, "created", {
          patches: Object.keys(elements.value).map((elementId) => ({
            op: "remove" as const,
            path: [elementId],
            value: null,
          })),
        });
      }
    }

    ctx.publish("page-patches", "created", { patches: [published] });
    return wireOk({ ok: true });
  },
);

// NOTE: keep the init callback as the second argument with nothing but
// whitespace before it - svelte-realtime codegen parses the stream value
// type textually from its return annotation.
/**
 * Live stream of element patch batches for a single page.
 *
 * @param ctx - The live request context.
 * @param pageId - The page whose elements are streamed.
 * @returns an empty initial patch payload.
 */
export const pageElementPatches = live.stream(
  (ctx, pageId: string) => `page-elements:${pageId}`,
  async (ctx, pageId: string): Promise<PatchPayload> => {
    assertLiveCan(ctx.user, "read", "Element");
    return { patches: [] };
  },
  { merge: "set", replay: true },
);

/**
 * Applies a single page element patch scoped to a page.
 *
 * @param ctx - The live request context.
 * @param input - The owning page id and the patch to apply.
 * @returns Ok with `{ ok: true }` on success, or Err from the element manager.
 * @throws {LiveError} when the patch does not target a whole element object.
 */
export const applyPageElementPatches = live(
  async (
    ctx,
    input: { pageId: string; patch: PatchOp },
  ): Promise<WireResult<{ ok: true }, NeverThrowError>> => {
    const { pageId, patch } = input;
    logger.trace(patch, `page-elements:${pageId}`);

    if (patch.path.length !== 1) {
      throw new LiveError(
        "INVALID_PATCH",
        "applyPageElementPatches() must update entire element objects",
      );
    }

    const page = pageManager.get(pageId);
    if (page.isErr()) return wireErr(page.error);

    const action = patch.op === "add" ? "create" : patch.op === "remove" ? "delete" : "update";
    assertLiveCan(ctx.user, action, "Element");

    const id = patch.path[0].toString();
    const owner = { type: "page", pageId } as const;
    let published: PatchOp[] = [patch];

    if (patch.op === "add") {
      const value = patch.value as ElementRecord;
      const result = pageElementManager.create(owner, { ...value, id });
      if (result.isErr()) return wireErr(result.error);
      published = [
        {
          op: "add",
          path: [id],
          value: result.value,
        },
      ];
    } else if (patch.op === "replace") {
      const value = patch.value as ElementRecord;
      const result = pageElementManager.replace(owner, id, { ...value, id });
      if (result.isErr()) return wireErr(result.error);
      published = [
        {
          op: "replace",
          path: [id],
          value: result.value,
        },
      ];
    } else if (patch.op === "remove") {
      const result = pageElementManager.remove(owner, id);
      if (result.isErr()) return wireErr(result.error);
      published = result.value.ids.map((elementId: string) => ({
        op: "remove" as const,
        path: [elementId],
        value: null,
      }));
    }

    ctx.publish(`page-elements:${pageId}`, "created", { patches: published });
    return wireOk({ ok: true });
  },
);
