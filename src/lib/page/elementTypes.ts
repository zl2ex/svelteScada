import type { ElementSelect } from "$lib/sqlite/tables/elements";

export const elementKinds = ["html", "svg", "base-component", "user-component"] as const;

export type ElementKind = (typeof elementKinds)[number];

export const containerTypes = ["none", "absolute", "flex", "grid", "block"] as const;

export type ContainerType = (typeof containerTypes)[number];

export type ElementStyle = Record<string, string>;

export type AttributeValue = string | number | boolean;

export type ElementAttributeValue = AttributeValue;

export type ElementAttributes = Record<string, ElementAttributeValue>;

export type ElementBindings = {
  text?: string;
  attributes?: Record<string, string>;
  style?: Record<string, string>;
  props?: Record<string, string>;
  events?: Record<string, string>;
};

export const userComponentPropTypes = ["string", "number", "boolean", "color", "tag"] as const;

export type UserComponentPropType = (typeof userComponentPropTypes)[number];

export type UserComponentPropDefinition = {
  key: string;
  label: string;
  type: UserComponentPropType;
  defaultValue?: AttributeValue;
  required?: boolean;
};

export type ElementRecord = Omit<ElementSelect, "pageId" | "userComponentId"> & {
  parentId: string | null;
};

export type ElementOwner =
  { type: "page"; pageId: string } | { type: "userComponent"; userComponentId: string };

export const routeSegmentPattern = /^[a-z0-9][a-z0-9-]*$/;

export function isValidRouteSegment(value: string) {
  return routeSegmentPattern.test(value);
}

export function elementStyleToString(style: ElementStyle) {
  return Object.entries(style)
    .filter(([, value]) => value !== "")
    .map(([property, value]) => `${property}:${value}`)
    .join(";");
}

export type ElementShape = Pick<ElementRecord, "kind" | "tag">;

export function isContainerElement(element: ElementShape | null | undefined) {
  return (
    !!element &&
    ((element.kind === "html" && element.tag === "div") ||
      (element.kind === "svg" && element.tag === "svg"))
  );
}

export function isSvgContainer(element: ElementShape | null | undefined) {
  return !!element && element.kind === "svg" && element.tag === "svg";
}

export function isSvgDrawingElement(element: ElementShape | null | undefined) {
  return !!element && element.kind === "svg" && element.tag !== "svg";
}

export function containerTypeStyle(containerType: ContainerType): ElementStyle {
  switch (containerType) {
    case "flex":
      return {
        display: "flex",
        "flex-wrap": "wrap",
        "align-content": "flex-start",
      };
    case "grid":
      return {
        display: "grid",
        "grid-template-columns": "repeat(12, minmax(0, 1fr))",
      };
    case "block":
      return { display: "block" };
    case "absolute":
      return { position: "relative" };
    default:
      return {};
  }
}

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

export function elementParentError(child: ElementShape, parent: ElementShape | null) {
  if (isSvgDrawingElement(child) && !isSvgContainer(parent)) {
    return "SVG drawing elements must be inside an <svg> container";
  }
  if (!parent) return null;
  if (!isContainerElement(parent)) {
    return "parent element is not a div or svg container";
  }
  if (isSvgContainer(parent) && child.kind !== "svg") {
    return "<svg> containers may only contain SVG elements";
  }
  return null;
}

export function elementContainerTypeError(
  element: ElementShape & { containerType: ContainerType },
) {
  if (!isContainerElement(element) && element.containerType !== "none") {
    return "only div and svg containers can set a container type";
  }
  return null;
}

export function sortedChildren<
  T extends { id: string; parentId: string | null; sortIndex: number },
>(items: Record<string, T>, parentId: string | null) {
  return Object.values(items)
    .filter((item) => item.parentId === parentId)
    .sort((a, b) => a.sortIndex - b.sortIndex || a.id.localeCompare(b.id));
}

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
