import { guard, live, LiveError } from "svelte-realtime/server";
import { logger } from "$lib/server/pino/logger";
import { tagManager, udtManager } from "../hooks.server";
import type { PatchOp, PatchPayload } from "$lib/client/live/patchCollection.svelte";
import { wireErr, wireOk, type NeverThrowError, type WireResult } from "$lib/util/neverThrow";
import { assertLiveCan } from "$lib/server/auth/authorize";
import { z_UdtDefinitionInput, type UdtDefinitionInput } from "$lib/sqlite/tables/udt_definitions";

export const _guard = guard((ctx) => {
  if (!ctx.user) throw new LiveError("UNAUTHENTICATED", "Must be logged in");
  assertLiveCan(ctx.user, "read", "UdtDefinition");
});

export const udtPatches = live.stream(
  "udt-patches",
  async (): Promise<PatchPayload> => ({ patches: [] }),
  {
    merge: "set",
    replay: true,
  },
);

export const applyUdtPatches = live(
  async (ctx, patch: PatchOp): Promise<WireResult<{ ok: true }, NeverThrowError>> => {
    logger.trace(patch, "udt-patches");
    if (patch.path.length !== 1) {
      throw new LiveError(
        "INVALID_PATCH",
        `applyUdtPatches() must update the entire UDT definition ${patch}`,
      );
    }

    const id = patch.path[0].toString();
    const action = patch.op === "add" ? "create" : patch.op === "remove" ? "delete" : "update";
    assertLiveCan(ctx.user, action, "UdtDefinition");

    if (patch.op === "add" || patch.op === "replace") {
      const parsed = z_UdtDefinitionInput.safeParse(patch.value);
      if (!parsed.success) {
        return wireErr({
          reason: "UDT_PARSE_ERROR",
          cause: parsed.error.message,
        } as const satisfies NeverThrowError);
      }

      const value = parsed.data as UdtDefinitionInput;

      if (patch.op === "add") {
        const result = await udtManager.createUdt(value);
        if (result.isErr()) return wireErr(result.error);
      } else {
        const result = await udtManager.updateUdt(id, value);
        if (result.isErr()) return wireErr(result.error);

        const { definition, previousName } = result.value;
        if (previousName !== definition.name) {
          tagManager.renameUdtDataType(previousName, definition.name);
        }

        const rebuild = tagManager.rebuildAllUdtInstances();
        const tagPatches: PatchOp[] = [
          ...rebuild.removed.map((tagId): PatchOp => ({ op: "remove", path: [tagId] })),
          ...rebuild.upserted.map((options): PatchOp => ({
            op: "replace",
            path: [options.id],
            value: options,
          })),
        ];
        if (tagPatches.length > 0) {
          ctx.publish("tag-patches", "created", { patches: tagPatches });
        }
      }
    } else {
      const definition = udtManager.getUdtById(id);
      if (!definition) {
        return wireErr({
          reason: "UDT_NOT_FOUND",
          cause: `no udt at id ${id}`,
        } as const satisfies NeverThrowError);
      }

      if (tagManager.countUdtInstances(definition.name) > 0) {
        return wireErr({
          reason: "UDT_IN_USE",
          cause: `cannot delete udt ${definition.name} while tags still use it`,
        } as const satisfies NeverThrowError);
      }

      const result = await udtManager.deleteUdt(id);
      if (result.isErr()) return wireErr(result.error);
    }

    ctx.publish("udt-patches", "created", { patches: [patch] });
    return wireOk({ ok: true });
  },
);
