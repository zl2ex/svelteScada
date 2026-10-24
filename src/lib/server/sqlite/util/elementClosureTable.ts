import { element_paths, elements, type ElementSelect } from "$lib/sqlite/tables";
import type { ElementOwner } from "$lib/page/elementTypes";
import { ClosureTable } from "./closureTable";

export type ElementClosureNode = ElementSelect & {
  parentId: string | null;
  path: string;
};

export function elementOwnerScope(owner: ElementOwner) {
  return owner.type === "page" ? `page:${owner.pageId}` : `component:${owner.userComponentId}`;
}

export const elementClosureTable = new ClosureTable<
  ElementSelect,
  { parent: string; child: string; depth: number }
>({
  items: elements,
  paths: element_paths,
  scopeKey: (element) =>
    element.pageId
      ? `page:${element.pageId}`
      : element.userComponentId
        ? `component:${element.userComponentId}`
        : null,
});
