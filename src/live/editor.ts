import { live } from "svelte-realtime/server";
import { z } from "zod";
import { enablePatches } from "immer";
import type { Patch } from "immer";
import { db } from "$lib/server/sqlite/db";
import { tag as tags, devices, displays } from "$lib/server/sqlite/tables";
import { eq, gt, sql } from "drizzle-orm";
import {
  tagFoldersClosureTable,
  deleteCascade,
  type ClosureTableNode,
} from "$lib/server/sqlite/tagClosureTable";

enablePatches();

const PatchSchema = z.object({
  op: z.enum(["add", "remove", "replace"]),
  path: z.array(z.string()),
  value: z.unknown().optional(),
});

const MutationSchema = z.object({
  collection: z.enum(["tags", "folders", "devices", "displays"]),
  patches: z.array(PatchSchema),
});

export type MutationSchema = z.input<typeof MutationSchema>;
export type CollectionName = MutationSchema["collection"];
export type Collections = Record<MutationSchema["collection"], any>;

// ── Streams ────────────────────────────────────────────────

export const foldersStream = live.stream(
  "tag-folders",
  async (): Promise<ClosureTableNode[]> => tagFoldersClosureTable.getAll(),
  { merge: "set" },
);

// ── Mutations ──────────────────────────────────────────────

export const applyMutation = live.validated(
  MutationSchema,
  async (ctx, { collection, patches }) => {
    if (collection === "folders") {
      applyFolderPatchesToTable(patches as Patch[]);
      const fullTree = tagFoldersClosureTable.getAll();
      ctx.publish("tag-folders", "set", fullTree);
      return { folders: fullTree };
    }

    applyTablePatches(collection, patches as Patch[]);
    if (collection === "tags") {
      const enrichedPatches = resolveEnrichedTagPatches(patches as Patch[]);
      ctx.publish("tags", "patched", { patches: enrichedPatches });
      return { patches: enrichedPatches };
    }

    ctx.publish(collection, "patched", { patches });
    return { patches };
  },
);

// ── Folder patches ────────────────────────────────────────

const FOLDER_PATCHABLE_FIELDS = new Set(["name", "parentId"]);

export function applyFolderPatchesToTable(patches: Patch[]) {
  for (const patch of patches) {
    const [id, field] = patch.path as [string, string?];

    if (patch.op === "remove" && !field) {
      deleteCascade(id);
    } else if (patch.op === "add" && !field) {
      const v = patch.value as
        | { name: string; parentId?: string | null }
        | undefined;
      const name = v?.name ?? "New Folder";
      const parentId = v?.parentId ?? null;
      tagFoldersClosureTable.add({ id, name } as any, parentId);
    } else if (field) {
      if (!FOLDER_PATCHABLE_FIELDS.has(field)) {
        throw new Error(`Invalid folder field: ${field}`);
      }
      if (field === "name") {
        tagFoldersClosureTable.rename(id, patch.value as string);
      } else if (field === "parentId") {
        tagFoldersClosureTable.move(id, patch.value as string);
      }
    }
  }
}

// ── Table patches ─────────────────────────────────────────

const tableMap = { tags, devices, displays } as const;

const ALLOWED_FIELDS: Record<string, Set<string>> = {
  tags: new Set(["name", "value", "nodeId"]),
  devices: new Set(["name"]),
  displays: new Set(["name"]),
};

function loadCollection(collection: string): Record<string, unknown> {
  const tbl = tableMap[collection as keyof typeof tableMap];
  if (!tbl) return {};
  const rows = db.select().from(tbl).all() as { id: string }[];
  return Object.fromEntries(rows.map((r) => [r.id, r]));
}

export function buildDelta(collection: string) {
  const tbl = tableMap[collection as keyof typeof tableMap];
  if (!tbl) return { version: () => 0, diff: () => null };
  return {
    version: (): number =>
      db
        .select({
          v: sql<number>`MAX(CAST(strftime('%s', ${(tbl as any).updatedAt}) AS INTEGER) * 1000)`,
        })
        .from(tbl)
        .get()?.v ?? 0,

    diff: (since: number): Record<string, unknown>[] | null => {
      const rows = db
        .select()
        .from(tbl)
        .where(gt((tbl as any).updatedAt, new Date(since)))
        .all();
      return rows.length > 0 ? rows : null;
    },
  };
}

export function applyTablePatches(collection: string, patches: Patch[]) {
  const tbl = tableMap[collection as keyof typeof tableMap];
  if (!tbl) return;

  db.transaction((tx) => {
    for (const patch of patches) {
      const [id, field] = patch.path as [string, string?];

      if (patch.op === "remove" && !field) {
        tx.delete(tbl).where(eq(tbl.id, id)).run();
      } else if (patch.op === "add" && !field) {
        tx.insert(tbl)
          .values({ id, ...(patch.value as object) } as any)
          .onConflictDoNothing()
          .run();
      } else if (field) {
        if (!ALLOWED_FIELDS[collection]?.has(field)) {
          throw new Error(`Invalid field: ${field} on ${collection}`);
        }
        tx.update(tbl)
          .set({
            [field]: patch.op === "remove" ? null : patch.value,
            ...((tbl as any).updatedAt ? { updatedAt: new Date() } : {}),
          } as any)
          .where(eq(tbl.id, id))
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
