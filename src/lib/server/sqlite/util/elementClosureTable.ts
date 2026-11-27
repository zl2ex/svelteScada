import { element_paths, elements, type ElementSelect } from "$lib/sqlite/tables";
import type { ElementOwner } from "$lib/elements/elementTypes";
import { ClosureTable } from "./closureTable";

export type ElementClosureNode = ElementSelect & {
  parentId: string | null;
  path: string;
};

/**
 * Builds the closure-table scope key for an element owner.
 *
 * @param owner - the page or user component that owns elements
 * @returns the scope key, for example `page:<id>` or `component:<id>`
 */
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
