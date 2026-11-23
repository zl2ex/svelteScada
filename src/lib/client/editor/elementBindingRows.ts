import type {
  AttributeValue,
  ElementAttributes,
  ElementProperties,
  ElementRecord,
  ElementStyle,
} from "$lib/elements/elementTypes";
import type { PropertyValue } from "$lib/propertyValue";
import { updateBinding } from "$lib/client/editor/bindings";

export type AttributeBindingScope = "attributes" | "props";
export type BindingScope = AttributeBindingScope | "style" | "text" | "styleClass";

export type ElementBindingRowData = {
  key: string;
  value: string;
  binding: string;
  result: string;
  error: string | null;
  placeholder?: string;
  description?: string;
  required?: boolean;
};

export function attributeBindingScope(element: ElementRecord): AttributeBindingScope {
  return element.kind === "user-component" || element.kind === "base-component"
    ? "props"
    : "attributes";
}

export function getBindingMap(
  element: ElementRecord,
  scope: Exclude<BindingScope, "text">,
): Record<string, string> {
  return element.bindings?.[scope] ?? {};
}

export function getTopLevelAttributes(element: ElementRecord): Record<string, AttributeValue> {
  return { ...element.attributes };
}

export function getElementProperties(element: ElementRecord): ElementProperties {
  return { ...element.properties };
}

export function setElementProperty(
  element: ElementRecord,
  key: string,
  value: PropertyValue | null,
): ElementProperties {
  const properties: ElementProperties = { ...element.properties };
  if (value === null) delete properties[key];
  else properties[key] = value;
  return properties;
}

export function setElementPropertyValue(
  element: ElementRecord,
  key: string,
  value: AttributeValue | null,
  metadata?: Partial<Omit<PropertyValue, "value">>,
): ElementProperties {
  const properties = getElementProperties(element);
  if (value === null) {
    delete properties[key];
    return properties;
  }
  properties[key] = {
    ...(properties[key] ?? { required: true }),
    ...metadata,
    value,
  };
  return properties;
}

export function removeElementPropertyRow(element: ElementRecord, key: string) {
  return {
    properties: setElementProperty(element, key, null),
    bindings: setBinding(element, "props", key, ""),
  };
}

export function getStyle(element: ElementRecord): ElementStyle {
  return { ...element.style };
}

export function setBinding(
  element: ElementRecord,
  scope: BindingScope,
  key: string,
  expression: string,
) {
  return updateBinding(element.bindings, scope, scope === "text" ? null : key, expression);
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
): ElementStyle {
  const style = getStyle(element);
  if (value === null) delete style[property];
  else style[property] = value;
  return style;
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
    style: setStyleProperty(element, property, null),
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

export { formatBindingResult } from "$lib/client/editor/bindings";
