export const TREE_DRAG_MIME = "application/x-svelte-scada-tree-node";

export type TreeDragKind = "page" | "element" | "tag" | "tag-folder";

export type TreeDragPayload = {
  kind: TreeDragKind;
  id: string;
};

export type DropPosition = "before" | "inside" | "after";

export function writeTreeDragData(event: DragEvent, payload: TreeDragPayload) {
  if (!event.dataTransfer) return;
  event.dataTransfer.setData(TREE_DRAG_MIME, JSON.stringify(payload));
  event.dataTransfer.setData("text/plain", payload.id);
  event.dataTransfer.effectAllowed = "move";
}

export function readTreeDragData(event: DragEvent): TreeDragPayload | null {
  const raw = event.dataTransfer?.getData(TREE_DRAG_MIME);
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as Partial<TreeDragPayload>;
    if (
      typeof value.id !== "string" ||
      !["page", "element", "tag", "tag-folder"].includes(value.kind ?? "")
    ) {
      return null;
    }
    return { kind: value.kind as TreeDragKind, id: value.id };
  } catch {
    return null;
  }
}

export function getDropPosition(
  event: DragEvent,
  element: Element,
  allowInside = true,
): DropPosition {
  const rect = element.getBoundingClientRect();
  const ratio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;

  if (!allowInside) return ratio < 0.5 ? "before" : "after";
  if (ratio < 0.25) return "before";
  if (ratio > 0.75) return "after";
  return "inside";
}

export function reorderIds(
  ids: string[],
  draggedId: string,
  targetId: string,
  position: DropPosition,
) {
  const next = ids.filter((id) => id !== draggedId);
  const targetIndex = next.indexOf(targetId);
  if (targetIndex === -1) return [...next, draggedId];

  const insertIndex =
    position === "before"
      ? targetIndex
      : position === "after"
        ? targetIndex + 1
        : next.length;
  next.splice(insertIndex, 0, draggedId);
  return next;
}
