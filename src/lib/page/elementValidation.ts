import { z } from "zod";
import { baseComponents } from "./baseComponents";
import {
  containerTypes,
  elementKinds,
  type ElementBindings,
  type ElementKind,
  type ElementRecord,
} from "./elementTypes";
import { htmlTags } from "./htmlTags";
import { svgTags } from "./svgTags";

export const z_ElementStyle = z.record(z.string(), z.string());

export const z_ElementAttributes = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z_ElementStyle]),
);

export const z_ElementBindings = z.object({
  text: z.string().optional(),
  attributes: z.record(z.string(), z.string()).optional(),
  style: z.record(z.string(), z.string()).optional(),
  props: z.record(z.string(), z.string()).optional(),
  events: z.record(z.string(), z.string()).optional(),
});

export const z_ElementWrite = z.object({
  id: z.string().min(1),
  parentId: z.string().nullable(),
  sortIndex: z.number().int().min(0),
  kind: z.enum(elementKinds),
  tag: z.string().nullable(),
  baseComponent: z.string().nullable(),
  referencedComponentId: z.string().nullable(),
  name: z.string(),
  text: z.string().nullable(),
  containerType: z.enum(containerTypes),
  attributes: z_ElementAttributes,
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

export function validateElementAttributes(attributes: Record<string, unknown>) {
  for (const [key, value] of Object.entries(attributes)) {
    if (key.trim() === "") return "Attribute names cannot be empty";
    if (["__proto__", "constructor", "prototype"].includes(key)) {
      return `Attribute "${key}" is not allowed`;
    }
    if (key === "style") {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return 'Attribute "style" must be an object of CSS properties';
      }
      const styleError = validateElementStyle(value as Record<string, unknown>);
      if (styleError) return styleError;
      continue;
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

export function normalizeBindings(
  _kind: ElementKind,
  bindings: ElementBindings | null,
): ElementBindings | null {
  return bindings;
}

export function parseElementWrite(value: unknown) {
  return z_ElementWrite.safeParse(value);
}

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
    containerType: value.containerType,
    attributes: value.attributes,
    bindings: value.bindings,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}
