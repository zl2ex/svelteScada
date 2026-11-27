import { sortedChildren } from "$lib/elements/elementTypes";

export type NudgeDirection = "previous" | "next";

type NudgeElement = {
  id: string;
  parentId: string | null;
  sortIndex: number;
};

/**
 * Finds contiguous runs of selected indices.
 * @param ids - Ordered element ids.
 * @param selected - Set of selected ids.
 * @returns Inclusive start/end index pairs for each run.
 */
function selectedRuns(ids: string[], selected: Set<string>) {
  const runs: Array<[number, number]> = [];

  for (let index = 0; index < ids.length; index++) {
    if (!selected.has(ids[index])) continue;

    let start = index;
    let end = index;
    while (start > 0 && selected.has(ids[start - 1])) start--;
    while (end + 1 < ids.length && selected.has(ids[end + 1])) end++;

    runs.push([start, end]);
    index = end;
  }

  return runs;
}

/**
 * Computes new sort indices that move selected elements one step.
 * @param elements - Elements keyed by id.
 * @param selectedIds - Ids to move.
 * @param direction - Move direction.
 * @returns Changed sort indices keyed by element id.
 */
export function nudgeSortIndices(
  elements: Record<string, NudgeElement>,
  selectedIds: Iterable<string>,
  direction: NudgeDirection,
): Record<string, number> {
  const selected = new Set(selectedIds);
  const selectedByParent = new Map<string | null, Set<string>>();

  for (const id of selected) {
    const element = elements[id];
    if (!element) continue;
    const group = selectedByParent.get(element.parentId) ?? new Set<string>();
    group.add(id);
    selectedByParent.set(element.parentId, group);
  }

  const changes: Record<string, number> = {};

  for (const [parentId, group] of selectedByParent) {
    const siblings = sortedChildren(elements, parentId);
    const ids = siblings.map((element) => element.id);
    const selectedInParent = new Set(ids.filter((id) => group.has(id)));
    const runs = selectedRuns(ids, selectedInParent);

    if (direction === "previous") {
      for (const [start, end] of runs) {
        if (start === 0) continue;
        const block = ids.splice(start, end - start + 1);
        ids.splice(start - 1, 0, ...block);
      }
    } else {
      for (let index = runs.length - 1; index >= 0; index--) {
        const [start, end] = runs[index];
        if (end === ids.length - 1) continue;
        const block = ids.splice(start, end - start + 1);
        ids.splice(start + 1, 0, ...block);
      }
    }

    for (let index = 0; index < ids.length; index++) {
      const element = elements[ids[index]];
      if (!element || element.sortIndex === index) continue;
      changes[element.id] = index;
    }
  }

  return changes;
}
