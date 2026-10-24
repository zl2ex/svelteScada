import { guard, live, LiveError } from "svelte-realtime/server";
import { logger } from "$lib/server/pino/logger";
import type { PatchOp, PatchPayload } from "$lib/client/live/patchCollection.svelte";
import { pageManager } from "$lib/server/page/pageManager";
import { pageElementManager } from "$lib/server/page/pageElementManager";
import type { ElementRecord } from "$lib/page/elementTypes";
import type { PageRecord } from "$lib/page/pageTypes";
import { wireErr, wireOk, type NeverThrowError, type WireResult } from "$lib/util/neverThrow";

export const _guard = guard((ctx) => {
  if (!ctx.user) throw new LiveError("UNAUTHENTICATED", "Must be logged in");
});

export const pagePatches = live.stream(
  "page-patches",
  async (): Promise<PatchPayload> => ({ patches: [] }),
  {
    merge: "set",
    replay: true,
  },
);

export const applyPagePatches = live(
  async (ctx, patch: PatchOp): Promise<WireResult<{ ok: true }, NeverThrowError>> => {
    logger.trace(patch, "page-patches");
    if (patch.path.length !== 1) {
      throw new LiveError("INVALID_PATCH", "applyPagePatches() must update entire page objects");
    }

    const id = patch.path[0].toString();
    const value = patch.value as PageRecord;
    let published = patch;

    if (patch.op === "add") {
      const result = pageManager.create({
        id,
        projectId: value.projectId,
        name: value.name,
        containerType: value.containerType,
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
        containerType: value.containerType,
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
export const pageElementPatches = live.stream(
  (ctx, pageId: string) => `page-elements:${pageId}`,
  async (ctx, pageId: string): Promise<PatchPayload> => ({ patches: [] }),
  { merge: "set", replay: true },
);

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
