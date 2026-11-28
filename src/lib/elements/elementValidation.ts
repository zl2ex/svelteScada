import { z } from "zod";
import { baseComponents } from "./baseComponents";
import {
  elementKinds,
  type ElementBindings,
  type ElementKind,
  type ElementRecord,
} from "./elementTypes";
import { htmlTags } from "./htmlTags";
import { svgTags } from "./svgTags";
import { z_BindingExpression, z_BindingExpressionMap } from "$lib/bindings";
import { z_PropertyMap } from "$lib/propertyValue";

export const z_ElementKind = z.enum(elementKinds);
export const z_AttributeValue = z.union([z.string(), z.number(), z.boolean()]);

export const z_ElementStyle = z.record(z.string(), z.string());

export const z_ElementAttributes = z.record(z.string(), z_AttributeValue);

export const z_ElementProperties = z_PropertyMap;

export const z_ElementBindings = z.object({
  text: z_BindingExpression.optional(),
  attributes: z_BindingExpressionMap.optional(),
  style: z_BindingExpressionMap.optional(),
  properties: z_BindingExpressionMap.optional(),
  events: z_BindingExpressionMap.optional(),
  styleClass: z_BindingExpressionMap.optional(),
});

const z_ElementStyleClass = z
  .array(z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_-]*$/, "invalid CSS class name"))
  .max(50)
  .refine((values) => new Set(values).size === values.length, "duplicate CSS class name")
  .default([]);

export const z_ElementWrite = z.object({
  id: z.string().min(1),
  parentId: z.string().nullable(),
  sortIndex: z.number().int().min(0),
  kind: z_ElementKind,
  tag: z.string().nullable(),
  baseComponent: z.string().nullable(),
  referencedComponentId: z.string().nullable(),
  name: z.string(),
  text: z.string().nullable(),
  attributes: z_ElementAttributes,
  properties: z_ElementProperties,
  style: z_ElementStyle,
  styleClass: z_ElementStyleClass,
  bindings: z_ElementBindings.nullable(),
});

const htmlTagSet = new Set<string>(htmlTags);
const svgTagSet = new Set<string>(svgTags);

const dangerousAttributeNames = new Set([
  "srcdoc",
  "onabort",
  "onblur",
  "onchange",
  "onclick",
  "ondblclick",
  "ondrag",
  "ondrop",
  "onerror",
  "onfocus",
  "oninput",
  "onkeydown",
  "onkeypress",
  "onkeyup",
  "onload",
  "onmousedown",
  "onmouseenter",
  "onmouseleave",
  "onmousemove",
  "onmouseout",
  "onmouseover",
  "onmouseup",
  "onreset",
  "onscroll",
  "onsubmit",
  "onwheel",
]);

/**
 * Validates the kind-specific fields of an element payload.
 *
 * @param element - The kind, tag, base component, and referenced component id
 * @returns An error message when invalid, or null when valid
 */
export function validateElementKindPayload(element: {
  kind: ElementKind;
  tag: string | null;
  baseComponent: string | null;
  referencedComponentId: string | null;
}) {
  if (element.kind === "html" || element.kind === "svg") {
    if (!element.tag) {
      return "HTML/SVG elements require a tag";
    }
    if (element.kind === "html" && !htmlTagSet.has(element.tag)) {
      return `HTML tag "${element.tag}" is not allowed`;
    }
    if (element.kind === "svg" && !svgTagSet.has(element.tag)) {
      return `SVG tag "${element.tag}" is not allowed`;
    }
    if (element.baseComponent || element.referencedComponentId) {
      return "HTML/SVG elements cannot reference a component";
    }
    return null;
  }

  if (element.kind === "base-component") {
    if (!element.baseComponent || !baseComponents[element.baseComponent]) {
      return `Unknown base component "${element.baseComponent ?? ""}"`;
    }
    if (element.tag || element.referencedComponentId) {
      return "Base components cannot use a tag or user component reference";
    }
    return null;
  }

  if (!element.referencedComponentId) {
    return "User component elements require referencedComponentId";
  }
  if (element.tag || element.baseComponent) {
    return "User component elements cannot use a tag or base component";
  }
  return null;
}

/**
 * Validates element attribute names and values against unsafe input.
 *
 * @param attributes - Attribute record to validate
 * @returns An error message when invalid, or null when valid
 */
export function validateElementAttributes(attributes: Record<string, unknown>) {
  for (const [key, value] of Object.entries(attributes)) {
    if (key.trim() === "") return "Attribute names cannot be empty";
    if (["__proto__", "constructor", "prototype"].includes(key)) {
      return `Attribute "${key}" is not allowed`;
    }
    if (key === "style") {
      return 'Attribute "style" must be edited in the Style section';
    }
    if (typeof value === "object" && value !== null) {
      return `Attribute "${key}" must be a string, number, or boolean`;
    }
    if (key.toLowerCase().startsWith("on") || dangerousAttributeNames.has(key.toLowerCase())) {
      return `Attribute "${key}" is not allowed`;
    }
    if (key.toLowerCase().startsWith("xlink:")) continue;
    if (typeof value === "string" && /^\s*javascript:/i.test(value)) {
      return `Attribute "${key}" contains a javascript: URL`;
    }
  }
  return null;
}

/**
 * Validates element style property names and values against unsafe input.
 *
 * @param style - Style record to validate
 * @returns An error message when invalid, or null when valid
 */
export function validateElementStyle(style: Record<string, unknown>) {
  for (const [property, value] of Object.entries(style)) {
    if (property.trim() === "") return "Style property names cannot be empty";
    if (["__proto__", "constructor", "prototype"].includes(property)) {
      return `Style "${property}" is not allowed`;
    }
    if (typeof value !== "string") {
      return `Style "${property}" must be a string value`;
    }
    if (/javascript\s*:|expression\s*\(|url\s*\(\s*['"]?\s*javascript:/i.test(value)) {
      return `Style "${property}" contains an unsafe value`;
    }
  }
  return null;
}

/**
 * Normalizes element bindings for the given element kind.
 *
 * @param _kind - The element kind (currently unused)
 * @param bindings - The bindings to normalize, or null
 * @returns The bindings unchanged, or null
 */
export function normalizeBindings(
  _kind: ElementKind,
  bindings: ElementBindings | null,
): ElementBindings | null {
  return bindings;
}

/**
 * Parses and validates an unknown element write payload.
 *
 * @param value - Unknown payload to parse
 * @returns The Zod SafeParseResult for the element write schema
 */
export function parseElementWrite(value: unknown) {
  return z_ElementWrite.safeParse(value);
}

/**
 * Copies a full element record into a new plain record.
 *
 * @param value - The element record to copy
 * @returns A shallow copy containing the normalized element fields
 */
export function toElementRecord(value: ElementRecord): ElementRecord {
  return {
    id: value.id,
    parentId: value.parentId,
    sortIndex: value.sortIndex,
    kind: value.kind,
    tag: value.tag,
    baseComponent: value.baseComponent,
    referencedComponentId: value.referencedComponentId,
    name: value.name,
    text: value.text,
    attributes: value.attributes,
    properties: value.properties,
    style: value.style,
    styleClass: value.styleClass,
    bindings: value.bindings,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}
