import type { ElementRecord } from "$lib/elements/elementTypes";

export type ElementLookup = (id: string | null | undefined) => ElementRecord | undefined;

/**
 * Builds a lookup over a page's elements and every user-component definition.
 *
 * @param pageElements - Elements belonging to the current page.
 * @param [userComponents] - Component definitions whose elements should also be reachable.
 * @returns A lookup that resolves an element id, or undefined when it is missing.
 */
export function createElementLookup(
  pageElements: Record<string, ElementRecord> | null | undefined,
  userComponents: Iterable<{ elements: Record<string, ElementRecord> }> = [],
): ElementLookup {
  const elements: Record<string, ElementRecord> = { ...(pageElements ?? {}) };
  for (const definition of userComponents) Object.assign(elements, definition.elements);
  return (id) => (id ? elements[id] : undefined);
}
