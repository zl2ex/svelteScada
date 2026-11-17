import { guard, live, LiveError } from "svelte-realtime/server";
import { logger } from "$lib/server/pino/logger";
import type { PatchOp, PatchPayload } from "$lib/client/live/patchCollection.svelte";
import { projectManager } from "$lib/server/project/projectManager";
import { pageManager } from "$lib/server/page/pageManager";
import { pageElementManager } from "$lib/server/page/pageElementManager";
import type { ProjectSelect } from "$lib/sqlite/tables";
import { assertLiveCan } from "$lib/server/auth/authorize";
import { wireErr, wireOk, type NeverThrowError, type WireResult } from "$lib/util/neverThrow";

export const _guard = guard((ctx) => {
  if (!ctx.user) throw new LiveError("UNAUTHENTICATED", "Must be logged in");
  assertLiveCan(ctx.user, "read", "Project");
});

export const projectPatches = live.stream(
  "project-patches",
  async (): Promise<PatchPayload> => ({ patches: [] }),
  {
    merge: "set",
    replay: true,
  },
);

export const applyProjectPatches = live(
  async (ctx, patch: PatchOp): Promise<WireResult<{ ok: true }, NeverThrowError>> => {
    logger.trace(patch, "project-patches");
    if (patch.path.length !== 1) {
      throw new LiveError(
        "INVALID_PATCH",
        "applyProjectPatches() must update entire project objects",
      );
    }

    const id = patch.path[0].toString();
    const value = patch.value as ProjectSelect;
    const action = patch.op === "add" ? "create" : patch.op === "remove" ? "delete" : "update";
    assertLiveCan(ctx.user, action, "Project");

    let published = patch;

    if (patch.op === "add") {
      const result = projectManager.create({ ...value, id });
      if (result.isErr()) return wireErr(result.error);
      published = { op: "add", path: [id], value: result.value };
    } else if (patch.op === "replace") {
      const result = projectManager.replace(id, { ...value, id });
      if (result.isErr()) return wireErr(result.error);
      published = { op: "replace", path: [id], value: result.value };
    } else if (patch.op === "remove") {
      const pages = pageManager.getAllForProject(id);
      const elements = pageElementManager.listForProject(id);
      const result = projectManager.delete(id);
      if (result.isErr()) return wireErr(result.error);

      if (pages.isOk() && pages.value.length > 0) {
        ctx.publish("page-patches", "created", {
          patches: pages.value.map((page) => ({
            op: "remove" as const,
            path: [page.id],
            value: null,
          })),
        });
      }

      if (elements.isOk()) {
        for (const [pageId, pageElements] of Object.entries(elements.value)) {
          const ids = Object.keys(pageElements);
          if (ids.length === 0) continue;
          ctx.publish(`page-elements:${pageId}`, "created", {
            patches: ids.map((elementId) => ({
              op: "remove" as const,
              path: [elementId],
              value: null,
            })),
          });
        }
      }
    }

    ctx.publish("project-patches", "created", { patches: [published] });
    return wireOk({ ok: true });
  },
);
