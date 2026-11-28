import type { ElementSelect } from "$lib/sqlite/tables/elements";
import type {
  z_AttributeValue,
  z_ElementAttributes,
  z_ElementBindings,
  z_ElementKind,
  z_ElementProperties,
  z_ElementStyle,
} from "./elementValidation";
import type { z } from "zod";

export const elementKinds = ["html", "svg", "base-component", "user-component"] as const;

export type ElementKind = (typeof elementKinds)[number];

export type ElementStyle = z.infer<typeof z_ElementStyle>;

export type AttributeValue = z.infer<typeof z_AttributeValue>;

export type ElementAttributeValue = AttributeValue;

export type ElementAttributes = z.infer<typeof z_ElementAttributes>;

export type ElementProperties = z.infer<typeof z_ElementProperties>;

export type ElementBindings = z.infer<typeof z_ElementBindings>;

export type ElementRecord = Omit<ElementSelect, "pageId" | "userComponentId"> & {
  parentId: string | null;
};

export type ElementOwner =
  { type: "page"; pageId: string } | { type: "userComponent"; userComponentId: string };

export const routeSegmentPattern = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Checks whether a value is a valid lowercase route segment.
 *
 * @param value - Candidate route segment
 * @returns True when the value matches the route segment pattern
 */
export function isValidRouteSegment(value: string) {
  return routeSegmentPattern.test(value);
}

/**
 * Serializes an element style object into a CSS declaration string.
 *
 * Empty values are omitted.
 *
 * @param style - Style record to serialize
 * @returns Semicolon-separated `property:value` declarations
 */
export function elementStyleToString(style: ElementStyle) {
  return Object.entries(style)
    .filter(([, value]) => value !== "")
    .map(([property, value]) => `${property}:${value}`)
    .join(";");
}

export type ElementShape = Pick<ElementRecord, "kind" | "tag">;

/**
 * Checks whether an element can contain child elements.
 *
 * @param element - Element shape to inspect
 * @returns True for div, svg, and g containers; false otherwise or when null
 */
export function isContainerElement(element: ElementShape | null | undefined) {
  return (
    !!element && ((element.kind === "html" && element.tag === "div") || isSvgContainer(element))
  );
}

/**
 * Checks whether an element is an SVG container.
 *
 * @param element - Element shape to inspect
 * @returns True when the element is an `svg` or `g` tag; false otherwise
 */
export function isSvgContainer(element: ElementShape | null | undefined) {
  return !!element && element.kind === "svg" && (element.tag === "svg" || element.tag === "g");
}

/**
 * Checks whether an element is an SVG drawing element.
 *
 * @param element - Element shape to inspect
 * @returns True for SVG elements other than the root `svg` tag; false otherwise
 */
export function isSvgDrawingElement(element: ElementShape | null | undefined) {
  return !!element && element.kind === "svg" && element.tag !== "svg";
}

/**
 * looks through selected elements and up the tree untill a parent element is found that is a
 * "container" that allows children
 *
 * @param elements - all elements to look in, usually the entire elements array for the page
 * @param selectedId - current selected element id to start the search from
 * @returns id of a container or null if not found
 */
export function findContainerInsertionTarget(
  elements: Record<string, ElementRecord>,
  selectedId: string | null,
) {
  const seen = new Set<string>();
  let current = selectedId ? elements[selectedId] : undefined;
  while (current) {
    if (isContainerElement(current)) return current.id;
    if (seen.has(current.id)) break;
    seen.add(current.id);
    current = current.parentId ? elements[current.parentId] : undefined;
  }
  return null;
}

/**
 * Validates that a child element is allowed inside a given parent.
 *
 * @param child - The child element shape
 * @param parent - The intended parent shape, or null for the root
 * @returns A human-readable error message, or null when the placement is valid
 */
export function elementParentError(child: ElementShape, parent: ElementShape | null) {
  if (isSvgDrawingElement(child) && !isSvgContainer(parent)) {
    return "SVG drawing elements must be inside an <svg> or <g> container";
  }
  if (!parent) return null;
  if (!isContainerElement(parent)) {
    return "parent element is not a div, svg, or g container";
  }
  if (isSvgContainer(parent) && child.kind !== "svg") {
    return "<svg> and <g> containers may only contain SVG elements";
  }
  return null;
}

/**
 * Returns the children of a parent sorted by sort index then id.
 *
 * @param items - Record of items keyed by id
 * @param parentId - Parent id to filter by, or null for root items
 * @returns An array of direct children in display order
 */
export function sortedChildren<
  T extends { id: string; parentId: string | null; sortIndex: number },
>(items: Record<string, T>, parentId: string | null) {
  return Object.values(items)
    .filter((item) => item.parentId === parentId)
    .sort((a, b) => a.sortIndex - b.sortIndex || a.id.localeCompare(b.id));
}

/**
 * Builds the ancestor chain from the root down to the given item.
 *
 * @param items - Record of items keyed by id
 * @param id - Id of the item whose chain to build
 * @returns Ancestors ordered root-first, including the item itself; empty when missing
 */
export function parentChain<T extends { id: string; parentId: string | null; name: string }>(
  items: Record<string, T>,
  id: string,
) {
  const chain: T[] = [];
  const seen = new Set<string>();
  let current: T | undefined = items[id];
  while (current) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    chain.unshift(current);
    current = current.parentId ? items[current.parentId] : undefined;
  }
  return chain;
}
