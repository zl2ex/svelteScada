import type { TagOptionsInput } from "$lib/server/tag/tag";
import type { UdtDefinitionInput } from "$lib/sqlite/tables/udt_definitions";
import { undoManager } from "$lib/client/history/undoManager";
import { buildEffectiveUdtRows } from "./udtBuilder";
import type { TagCollection } from "./tagCollectionContext";
import type { UdtDefinitionCollection } from "./udtDefinitionContext";

/**
 * Collects all descendant rows below a parent id.
 *
 * @param parentId - Id whose descendants should be collected
 * @param childrenByParent - Tag rows grouped by parent id
 * @param [out] - Accumulator map keyed by id (defaults to an empty map)
 * @returns The accumulated descendants keyed by id
 */
function collectDescendants(
  parentId: string,
  childrenByParent: Map<string, TagOptionsInput[]>,
  out = new Map<string, TagOptionsInput>(),
) {
  for (const child of childrenByParent.get(parentId) ?? []) {
    out.set(child.id, child);
    collectDescendants(child.id, childrenByParent, out);
  }
  return out;
}

/**
 * Rebuilds all flattened UDT instance rows after a definition, binding, or override change.
 * Rows are materialized so top-level fields always contain effective binding results.
 *
 * @param tagCollection - Live tag collection to update
 * @param udtCollection - UDT definition collection driving the rebuild
 */
export function rebuildUdtInstances(
  tagCollection: TagCollection,
  udtCollection: UdtDefinitionCollection,
) {
  const definitionsByName = Object.fromEntries(
    Object.values(udtCollection.state).map((definition) => [definition.name, definition]),
  ) as Record<string, UdtDefinitionInput>;

  const allTags = Object.values(tagCollection.state);
  const preserved = new Map(allTags.map((tag) => [tag.id, tag] as const));
  const childrenByParent = new Map<string, TagOptionsInput[]>();
  for (const tag of allTags) {
    if (!tag.parentTagId) continue;
    const group = childrenByParent.get(tag.parentTagId) ?? [];
    group.push(tag);
    childrenByParent.set(tag.parentTagId, group);
  }

  const updates: Array<{ id: string; changes: Partial<Omit<TagOptionsInput, "id">> }> = [];
  const adds: TagOptionsInput[] = [];
  const removes: string[] = [];

  for (const root of allTags) {
    if (root.parentTagId || !root.udtDefinitionId) continue;

    const desiredRows = buildEffectiveUdtRows(root, definitionsByName, preserved);
    const desiredIds = new Set(desiredRows.map((row) => row.id));
    const existingChildren = collectDescendants(root.id, childrenByParent);

    for (const existing of existingChildren.values()) {
      if (!desiredIds.has(existing.id)) removes.push(existing.id);
    }

    for (const desired of desiredRows) {
      const isRoot = desired.id === root.id;
      const existing = isRoot ? preserved.get(desired.id) : existingChildren.get(desired.id);
      if (!existing) {
        if (!isRoot) adds.push(desired);
        continue;
      }
      if (JSON.stringify(existing) !== JSON.stringify(desired)) {
        const { id, ...changes } = desired;
        updates.push({ id, changes });
      }
    }
  }

  if (updates.length === 0 && adds.length === 0 && removes.length === 0) return;

  undoManager.beginTransaction();
  if (updates.length > 0) tagCollection.updateMany(updates);
  if (adds.length > 0) tagCollection.addMany(adds);
  if (removes.length > 0) tagCollection.removeMany(removes);
  undoManager.endTransaction();
}
