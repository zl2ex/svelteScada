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

export type ElementBindingRowControl = {
  value: string;
  disabled: boolean;
  bound: boolean;
  placeholder: string;
  commit: (value: string) => void;
  context?: unknown;
};

/**
 * Determines whether an element stores bindings under attributes or props.
 * @param element - Element to inspect.
 * @returns The applicable attribute binding scope.
 */
export function attributeBindingScope(element: ElementRecord): AttributeBindingScope {
  return element.kind === "user-component" || element.kind === "base-component"
    ? "props"
    : "attributes";
}

/**
 * Returns the binding map for an element scope.
 * @param element - Element to inspect.
 * @param scope - Binding scope excluding text.
 * @returns The bindings keyed by attribute or property name.
 */
export function getBindingMap(
  element: ElementRecord,
  scope: Exclude<BindingScope, "text">,
): Record<string, string> {
  return element.bindings?.[scope] ?? {};
}

/**
 * Returns a shallow copy of an element's attributes.
 * @param element - Element to copy.
 * @returns The copied attribute map.
 */
export function getTopLevelAttributes(element: ElementRecord): Record<string, AttributeValue> {
  return { ...element.attributes };
}

/**
 * Returns a shallow copy of an element's properties.
 * @param element - Element to copy.
 * @returns The copied properties map.
 */
export function getElementProperties(element: ElementRecord): ElementProperties {
  return { ...element.properties };
}

/**
 * Sets or removes a property entry on an element.
 * @param element - Element to update.
 * @param key - Property key.
 * @param value - New property value, or null to remove it.
 * @returns The updated properties map.
 */
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

/**
 * Sets or removes a property value while preserving property metadata.
 * @param element - Element to update.
 * @param key - Property key.
 * @param value - New attribute value, or null to remove it.
 * @param [metadata] - Extra property metadata to merge.
 * @returns The updated properties map.
 */
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

/**
 * Removes a property row and its binding from an element.
 * @param element - Element to update.
 * @param key - Property key to remove.
 * @returns The updated properties and bindings.
 */
export function removeElementPropertyRow(element: ElementRecord, key: string) {
  return {
    properties: setElementProperty(element, key, null),
    bindings: setBinding(element, "props", key, ""),
  };
}

/**
 * Returns a shallow copy of an element's style.
 * @param element - Element to copy.
 * @returns The copied style map.
 */
export function getStyle(element: ElementRecord): ElementStyle {
  return { ...element.style };
}

/**
 * Updates the binding expression for an element scope.
 * @param element - Element to update.
 * @param scope - Binding scope.
 * @param key - Binding key.
 * @param expression - New expression, or an empty string to remove it.
 * @returns The updated bindings, or null when empty.
 */
export function setBinding(
  element: ElementRecord,
  scope: BindingScope,
  key: string,
  expression: string,
) {
  return updateBinding(element.bindings, scope, scope === "text" ? null : key, expression);
}

/**
 * Sets or removes a top-level attribute on an element.
 * @param element - Element to update.
 * @param key - Attribute key.
 * @param value - New attribute value, or null to remove it.
 * @returns The updated attributes map.
 */
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

/**
 * Sets or removes a style property on an element.
 * @param element - Element to update.
 * @param property - Style property name.
 * @param value - New style value, or null to remove it.
 * @returns The updated style map.
 */
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

/**
 * Removes an attribute row and its binding from an element.
 * @param element - Element to update.
 * @param scope - Attribute binding scope.
 * @param key - Attribute key to remove.
 * @returns The updated attributes and bindings.
 */
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

/**
 * Removes a style row and its binding from an element.
 * @param element - Element to update.
 * @param property - Style property to remove.
 * @returns The updated style and bindings.
 */
export function removeStyleRow(element: ElementRecord, property: string) {
  return {
    style: setStyleProperty(element, property, null),
    bindings: setBinding(element, "style", property, ""),
  };
}

/**
 * Coerces raw input to the type of the previous attribute value.
 * @param previous - Previous attribute value used to infer the type.
 * @param raw - Raw input string.
 * @returns The coerced number, boolean, or string value.
 */
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
