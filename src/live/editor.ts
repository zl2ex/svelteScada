import { live } from "svelte-realtime/server";
import { z } from "zod";
import { applyPatches, enablePatches } from "immer";
import type { Patch } from "immer";
import type { CollectionName } from "$lib/types";
import { patchMerge, squashPatches } from "$lib/client/versioning/patches";
import { db } from "$lib/server/sqlite/db";
import { tag as tags, devices, displays } from "$lib/server/sqlite/tables";
import type { TagSelect, Device, Display } from "$lib/server/sqlite/tables";
import { eq, gt, sql } from "drizzle-orm";

enablePatches();

const PatchSchema = z.object({
  op: z.enum(["add", "remove", "replace"]),
  path: z.array(z.string()),
  value: z.unknown().optional(),
});

const MutationSchema = z.object({
  collection: z.enum(["tags", "devices", "displays"]),
  patches: z.array(PatchSchema),
});

// ── Streams ────────────────────────────────────────────────

export const tagsStream = live.stream(
  "tags",
  (): Record<string, TagSelect> => loadCollection("tags"),
  {
    merge: "crud",
    key: "id",
    //merge: patchMerge,
    //delta: buildDelta("tags"),
  },
);

export const devicesStream = live.stream(
  "devices",
  (): Record<string, Device> => loadCollection("devices"),
  {
    merge: patchMerge,
    delta: buildDelta("devices"),
  },
);

export const displaysStream = live.stream(
  "displays",
  (): Record<string, Display> => loadCollection("displays"),
  {
    merge: patchMerge,
    delta: buildDelta("displays"),
  },
);

// ── Mutations ──────────────────────────────────────────────

export const applyMutation = live.validated(
  MutationSchema,
  async (ctx, { collection, patches }) => {
    applyPatchesToTable(collection, patches as Patch[]);

    if (collection === "tags") {
      const enrichedPatches = resolveEnrichedTagPatches(patches as Patch[]);
      ctx.publish("tags", "patched", { patches: enrichedPatches });
      return { patches: enrichedPatches };
    }

    ctx.publish(collection, "patched", { patches });
    return { patches };
  },
);

// helpers
const tableMap = { tags, devices, displays } as const;

const ALLOWED_FIELDS: Record<CollectionName, Set<string>> = {
  tags: new Set(["name", "value", "nodeId"]),
  devices: new Set(["name"]),
  displays: new Set(["name"]),
};

function loadCollection(collection: CollectionName): Record<string, unknown> {
  const rows = db.select().from(tableMap[collection]).all() as { id: string }[];
  return Object.fromEntries(rows.map((r) => [r.id, r]));
}

export function buildDelta(collection: CollectionName) {
  const table = tableMap[collection];
  return {
    version: (): number =>
      db
        .select({
          v: sql<number>`MAX(CAST(strftime('%s', ${table.updatedAt}) AS INTEGER) * 1000)`,
        })
        .from(table)
        .get()?.v ?? 0,

    diff: (since: number): Record<string, unknown>[] | null => {
      const rows = db
        .select()
        .from(table)
        .where(gt(table.updatedAt, new Date(since)))
        .all();
      return rows.length > 0 ? rows : null;
    },
  };
}

export function applyPatchesToTable(
  collection: CollectionName,
  patches: Patch[],
) {
  const table = tableMap[collection];

  db.transaction((tx) => {
    for (const patch of patches) {
      const [id, field] = patch.path as [string, string?];

      if (patch.op === "remove" && !field) {
        tx.delete(table).where(eq(table.id, id)).run();
      } else if (patch.op === "add" && !field) {
        tx.insert(table)
          .values({ id, ...(patch.value as object) })
          .onConflictDoNothing()
          .run();
      } else if (field) {
        if (!ALLOWED_FIELDS[collection].has(field)) {
          throw new Error(`Invalid field: ${field} on ${collection}`);
        }
        tx.update(table)
          .set({
            [field]: patch.op === "remove" ? null : patch.value,
            updatedAt: new Date(),
          })
          .where(eq(table.id, id))
          .run();
      }
    }
  });
}

export function resolveEnrichedTagPatches(patches: Patch[]): Patch[] {
  const updatedIds = [...new Set(patches.map((p) => p.path[0]))];
  const enriched = db
    .select()
    .from(tags)
    .where(
      sql`${tags.id} IN (${sql.join(
        updatedIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    )
    .all();

  return enriched.flatMap((tag) => [
    { op: "replace" as const, path: [tag.id, "name"], value: tag.name },
    { op: "replace" as const, path: [tag.id, "value"], value: tag.value },
  ]);
}
