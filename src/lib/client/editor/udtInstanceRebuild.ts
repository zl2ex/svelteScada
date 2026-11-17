import type { TagOptionsInput } from "$lib/server/tag/tag";
import type { UdtDefinitionInput } from "$lib/sqlite/tables/udt_definitions";
import { undoManager } from "$lib/client/history/undoManager";
import { buildResolvedUdtRows } from "./udtBuilder";
import type { TagCollection } from "./tagCollectionContext";
import type { UdtDefinitionCollection } from "./udtDefinitionContext";

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

    const desiredRows = buildResolvedUdtRows(root, definitionsByName, preserved);
    const desiredIds = new Set(desiredRows.map((row) => row.id));
    const existingChildren = collectDescendants(root.id, childrenByParent);

    for (const existing of existingChildren.values()) {
      if (!desiredIds.has(existing.id)) removes.push(existing.id);
    }

    for (const desired of desiredRows.slice(1)) {
      const existing = existingChildren.get(desired.id);
      if (!existing) {
        adds.push(desired);
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
