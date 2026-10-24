import type {
  AttributeValue,
  ElementAttributes,
  ElementBindings,
  ElementRecord,
  ElementStyle,
} from "$lib/page/elementTypes";
import { isElementStyle } from "$lib/page/elementTypes";

export type AttributeBindingScope = "attributes" | "props";
export type BindingScope = AttributeBindingScope | "style" | "text";

export type ElementBindingRowData = {
  key: string;
  value: string;
  binding: string;
  result: string;
};

export function attributeBindingScope(element: ElementRecord): AttributeBindingScope {
  return element.kind === "user-component" ? "props" : "attributes";
}

export function getBindingMap(
  element: ElementRecord,
  scope: Exclude<BindingScope, "text">,
): Record<string, string> {
  return element.bindings?.[scope] ?? {};
}

export function getTopLevelAttributes(element: ElementRecord): Record<string, AttributeValue> {
  const attributes: Record<string, AttributeValue> = {};
  for (const [key, value] of Object.entries(element.attributes)) {
    if (!isElementStyle(value)) attributes[key] = value;
  }
  return attributes;
}

export function getStyle(element: ElementRecord): ElementStyle {
  return isElementStyle(element.attributes.style) ? { ...element.attributes.style } : {};
}

function cloneBindings(element: ElementRecord): ElementBindings {
  const bindings: ElementBindings = {};
  if (element.bindings?.text !== undefined) bindings.text = element.bindings.text;
  if (element.bindings?.attributes) bindings.attributes = { ...element.bindings.attributes };
  if (element.bindings?.style) bindings.style = { ...element.bindings.style };
  if (element.bindings?.props) bindings.props = { ...element.bindings.props };
  if (element.bindings?.events) bindings.events = { ...element.bindings.events };
  return bindings;
}

export function setBinding(
  element: ElementRecord,
  scope: BindingScope,
  key: string,
  expression: string,
): ElementBindings | null {
  const bindings = cloneBindings(element);

  if (scope === "text") {
    if (expression.trim()) bindings.text = expression;
    else delete bindings.text;
  } else {
    const map = { ...(bindings[scope] ?? {}) };
    if (expression.trim()) map[key] = expression;
    else delete map[key];

    if (Object.keys(map).length > 0) bindings[scope] = map;
    else delete bindings[scope];
  }

  return Object.keys(bindings).length > 0 ? bindings : null;
}

export function setTopLevelAttribute(
  element: ElementRecord,
  key: string,
  value: AttributeValue | null,
): ElementAttributes {
  const attributes: ElementAttributes = { ...element.attributes };
  if (value === null) delete attributes[key];
  else attributes[key] = value;
  return attributes;
}

export function setStyleProperty(
  element: ElementRecord,
  property: string,
  value: string | null,
): ElementAttributes {
  const style = getStyle(element);
  if (value === null) delete style[property];
  else style[property] = value;

  const attributes: ElementAttributes = { ...element.attributes };
  if (Object.keys(style).length > 0) attributes.style = style;
  else delete attributes.style;
  return attributes;
}

export function removeTopLevelAttributeRow(
  element: ElementRecord,
  scope: AttributeBindingScope,
  key: string,
) {
  return {
    attributes: setTopLevelAttribute(element, key, null),
    bindings: setBinding(element, scope, key, ""),
  };
}

export function removeStyleRow(element: ElementRecord, property: string) {
  return {
    attributes: setStyleProperty(element, property, null),
    bindings: setBinding(element, "style", property, ""),
  };
}

export function coerceAttributeValue(
  previous: AttributeValue | undefined,
  raw: string,
): AttributeValue {
  if (typeof previous === "number") {
    const value = Number(raw);
    if (raw.trim() !== "" && Number.isFinite(value)) return value;
  }

  if (typeof previous === "boolean") {
    if (raw === "true" || raw === "1") return true;
    if (raw === "false" || raw === "0") return false;
  }

  return raw;
}

export function formatBindingResult(value: unknown): string {
  if (value === undefined) return "";
  if (value === null) return "null";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value) ?? "";
    } catch {
      return String(value);
    }
  }
  return String(value);
}
