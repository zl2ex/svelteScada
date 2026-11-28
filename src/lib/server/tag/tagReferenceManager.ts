import { eq } from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";
import type { PatchOp } from "$lib/client/live/patchCollection.svelte";
import type { ElementBindings } from "$lib/elements/elementTypes";
import type { TagOptionsInput } from "$lib/server/tag/tag";
import type { UdtDefinitionTagInput } from "$lib/sqlite/tables/udt_definitions";
import { db } from "$lib/server/sqlite/db";
import { tables } from "$lib/sqlite/tables";
import { attempt } from "$lib/util/attempt";
import { errorToString, type NeverThrowError } from "$lib/util/neverThrow";
import { rewriteQuotedTagPaths, type TagPathMapping } from "$lib/tagReferenceRewrite";
import { logger } from "../pino/logger";
import type { TagManager } from "./tagManager";
import type { UdtManager } from "./udtManager";
import { pageElementManager } from "../page/pageElementManager";

export type TagReferenceUpdateResult = {
  tagPatches: PatchOp[];
  udtPatches: PatchOp[];
  elementPatches: Array<{ pageId: string; patches: PatchOp[] }>;
};

/**
 * Rewrites tag-path references inside the values of a string map.
 *
 * @param map - String map to rewrite, may be null or undefined.
 * @param mappings - Path mappings to apply.
 * @returns Object with the rewritten map and whether any value changed.
 */
function rewriteStringMap<T extends Record<string, string>>(
  map: T | null | undefined,
  mappings: TagPathMapping[],
) {
  if (!map) return { value: map, changed: false };

  const next: Record<string, string> = { ...map };
  let changed = false;
  for (const [key, value] of Object.entries(next)) {
    const rewritten = rewriteQuotedTagPaths(value, mappings);
    if (rewritten !== value) {
      next[key] = rewritten;
      changed = true;
    }
  }

  return { value: next as T, changed };
}

/**
 * Rewrites tag-path references inside the bindings of a UDT overrides object.
 *
 * @param overrides - UDT overrides object to rewrite, may be null or undefined.
 * @param mappings - Path mappings to apply.
 * @returns Object with the rewritten overrides and whether anything changed.
 */
function rewriteOverrides(
  overrides: Record<string, unknown> | null | undefined,
  mappings: TagPathMapping[],
) {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    return { value: overrides, changed: false };
  }

  const bindings = overrides.bindings;
  if (!bindings || typeof bindings !== "object" || Array.isArray(bindings)) {
    return { value: overrides, changed: false };
  }

  const rewritten = rewriteStringMap(bindings as Record<string, string>, mappings);
  if (!rewritten.changed) return { value: overrides, changed: false };

  return {
    value: { ...overrides, bindings: rewritten.value },
    changed: true,
  };
}

/**
 * Rewrites tag-path references in an element's text and binding scopes.
 *
 * @param bindings - Element bindings to rewrite, may be null or undefined.
 * @param mappings - Path mappings to apply.
 * @returns Object with the rewritten bindings and whether anything changed.
 */
function rewriteElementBindings(
  bindings: ElementBindings | null | undefined,
  mappings: TagPathMapping[],
) {
  if (!bindings) return { value: bindings, changed: false };

  const next: ElementBindings = { ...bindings };
  let changed = false;

  if (next.text) {
    const rewritten = rewriteQuotedTagPaths(next.text, mappings);
    if (rewritten !== next.text) {
      next.text = rewritten;
      changed = true;
    }
  }

  for (const scope of ["attributes", "style", "properties", "events", "styleClass"] as const) {
    const rewritten = rewriteStringMap(next[scope], mappings);
    if (rewritten.changed) {
      (next as Record<string, unknown>)[scope] = rewritten.value;
      changed = true;
    }
  }

  return { value: next, changed };
}

/**
 * Rewrites literal tag-path references across all persisted bindings affected by a path change.
 * Updates the database, in-memory tag/UDT managers, and returns patch operations for live clients.
 *
 * @param mappings - Path mappings describing old-to-new tag references.
 * @param managers - In-memory tag and UDT managers to update.
 * @returns Ok with patch operations, or Err when the database transaction fails.
 */
export function rewritePersistedTagReferences(
  mappings: TagPathMapping[],
  managers: { tagManager: TagManager; udtManager: UdtManager },
): Result<TagReferenceUpdateResult, NeverThrowError> {
  if (mappings.length === 0) {
    return ok({ tagPatches: [], udtPatches: [], elementPatches: [] });
  }

  const applied = attempt(() =>
    db.transaction((tx) => {
      const tagUpdates = new Map<
        string,
        { bindings: TagOptionsInput["bindings"]; udtOverrides: TagOptionsInput["udtOverrides"] }
      >();
      const udtUpdates = new Map<string, UdtDefinitionTagInput[]>();
      const elementUpdates: Array<{ id: string; pageId: string | null }> = [];

      for (const row of db
        .select({
          id: tables.tags.id,
          bindings: tables.tags.bindings,
          udtOverrides: tables.tags.udtOverrides,
        })
        .from(tables.tags)
        .all()) {
        const bindings = rewriteStringMap(row.bindings, mappings);
        const overrides = rewriteOverrides(row.udtOverrides, mappings);
        if (!bindings.changed && !overrides.changed) continue;

        tx.update(tables.tags)
          .set({
            bindings: bindings.value as TagOptionsInput["bindings"],
            udtOverrides: overrides.value as TagOptionsInput["udtOverrides"],
          })
          .where(eq(tables.tags.id, row.id))
          .run();

        tagUpdates.set(row.id, {
          bindings: bindings.value as TagOptionsInput["bindings"],
          udtOverrides: overrides.value as TagOptionsInput["udtOverrides"],
        });
      }

      for (const row of db
        .select({ id: tables.udt_definitions.id, children: tables.udt_definitions.children })
        .from(tables.udt_definitions)
        .all()) {
        let changed = false;
        const children = row.children.map((child) => {
          const bindings = rewriteStringMap(child.bindings, mappings);
          if (!bindings.changed) return child;
          changed = true;
          return { ...child, bindings: bindings.value };
        });
        if (!changed) continue;

        tx.update(tables.udt_definitions)
          .set({ children })
          .where(eq(tables.udt_definitions.id, row.id))
          .run();

        udtUpdates.set(row.id, children);
      }

      for (const row of db
        .select({
          id: tables.elements.id,
          pageId: tables.elements.pageId,
          bindings: tables.elements.bindings,
        })
        .from(tables.elements)
        .all()) {
        const bindings = rewriteElementBindings(row.bindings, mappings);
        if (!bindings.changed) continue;

        tx.update(tables.elements)
          .set({ bindings: bindings.value, updatedAt: Date.now() })
          .where(eq(tables.elements.id, row.id))
          .run();

        elementUpdates.push({ id: row.id, pageId: row.pageId });
      }

      return { tagUpdates, udtUpdates, elementUpdates };
    }),
  );

  if (applied.isErr) {
    logger.error(`[TagReferenceManager] rewrite failed ${errorToString(applied.error)}`);
    return err({
      reason: "TAG_REFERENCE_UPDATE_FAILED",
      cause: errorToString(applied.error),
    } as const satisfies NeverThrowError);
  }

  const tagOptions = managers.tagManager.applyBindingUpdates(applied.data.tagUpdates);
  const udtDefinitions = managers.udtManager.applyBindingUpdates(applied.data.udtUpdates);

  const tagPatches: PatchOp[] = tagOptions.map((value) => ({
    op: "replace",
    path: [value.id],
    value,
  }));
  const udtPatches: PatchOp[] = udtDefinitions.map((value) => ({
    op: "replace",
    path: [value.id],
    value,
  }));

  const elementPatchesByPage = new Map<string, PatchOp[]>();
  for (const item of applied.data.elementUpdates) {
    if (!item.pageId) continue;
    const element = pageElementManager.get({ type: "page", pageId: item.pageId }, item.id);
    if (element.isErr()) continue;

    const patches = elementPatchesByPage.get(item.pageId) ?? [];
    patches.push({ op: "replace", path: [item.id], value: element.value });
    elementPatchesByPage.set(item.pageId, patches);
  }

  return ok({
    tagPatches,
    udtPatches,
    elementPatches: [...elementPatchesByPage].map(([pageId, patches]) => ({
      pageId,
      patches,
    })),
  });
}

type PublishContext = {
  publish: (topic: string, event: string, payload: unknown) => void;
};

/**
 * Publishes rewritten binding patches to all affected live collections.
 *
 * @param ctx - Publish context used to emit live events.
 * @param result - Patch operations to publish.
 */
export function publishTagReferenceUpdates(ctx: PublishContext, result: TagReferenceUpdateResult) {
  if (result.tagPatches.length > 0) {
    ctx.publish("tag-patches", "created", { patches: result.tagPatches });
  }
  if (result.udtPatches.length > 0) {
    ctx.publish("udt-patches", "created", { patches: result.udtPatches });
  }
  for (const elementPatch of result.elementPatches) {
    ctx.publish(`page-elements:${elementPatch.pageId}`, "created", {
      patches: elementPatch.patches,
    });
  }
}
