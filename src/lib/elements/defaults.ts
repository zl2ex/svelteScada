import type { ElementAttributes, ElementKind, ElementStyle } from "./elementTypes";
import type { PropertyMap } from "$lib/propertyValue";
import { baseComponents } from "./baseComponents";
import { htmlElementDefaults } from "./htmlElementDefaults";
import type { HtmlTag } from "./htmlTags";
import { svgElementDefaults } from "./svgElementDefaults";
import { svgTags, type SvgTag } from "./svgTags";

export type ElementFingerprint = {
  tag?: string | null;
  baseComponent?: string | null;
};

export type ElementDefaultsInput = {
  attributes?: ElementAttributes;
  properties?: PropertyMap;
  style?: ElementStyle;
};

export type ElementDefaults = {
  attributes: ElementAttributes;
  properties: PropertyMap;
  style: ElementStyle;
};

/**
 * Clones defaults and removes attribute keys shadowed by style keys.
 *
 * Style wins when an attribute and style property share a name.
 *
 * @param defaults - Partial defaults to normalize
 * @returns A complete ElementDefaults with style-overlapping attributes removed
 */
function normalizeDefaults(defaults: ElementDefaultsInput): ElementDefaults {
  const style = { ...defaults.style };
  const attributes = { ...defaults.attributes };

  for (const key of Object.keys(style)) {
    delete attributes[key];
  }

  return { attributes, properties: { ...defaults.properties }, style };
}

/**
 * Looks up default attributes and style for an HTML tag.
 *
 * @param tag - HTML tag name, or null/undefined
 * @returns The registered defaults for the tag, or an empty object
 */
function getHtmlDefaults(tag: string | null | undefined) {
  if (!tag) return {};
  return htmlElementDefaults[tag as HtmlTag] ?? {};
}

/**
 * Looks up default attributes and style for an SVG tag.
 *
 * @param tag - SVG tag name, or null/undefined
 * @returns The registered defaults for the tag, or an empty object
 */
function getSvgDefaults(tag: string | null | undefined) {
  if (!tag) return {};
  return svgElementDefaults[tag as SvgTag] ?? {};
}

/**
 * Looks up the default properties for a base component.
 *
 * @param baseComponent - Base component name, or null/undefined
 * @returns The component's default PropertyMap, or an empty object
 */
function getBaseComponentDefaults(baseComponent: string | null | undefined) {
  if (!baseComponent) return {};
  return baseComponents[baseComponent]?.defaultProperties ?? {};
}

/**
 * Builds the default attributes, properties, and style for a new element.
 *
 * @param kind - The kind of element being created
 * @param options - Fingerprint with the tag or base component to look up
 * @returns Normalized ElementDefaults for the element
 */
export function getDefaultElementConfig(
  kind: ElementKind,
  options: ElementFingerprint,
): ElementDefaults {
  switch (kind) {
    case "html":
      return normalizeDefaults(getHtmlDefaults(options.tag));
    case "svg":
      return normalizeDefaults(getSvgDefaults(options.tag));
    case "base-component":
      return normalizeDefaults({ properties: getBaseComponentDefaults(options.baseComponent) });
    case "user-component":
      return normalizeDefaults({});
  }
}

/**
 * Returns the default attributes for a new element of the given kind.
 *
 * @param kind - The kind of element being created
 * @param options - Fingerprint with the tag or base component to look up
 * @returns The default ElementAttributes for the element
 */
export function getDefaultElementAttributes(kind: ElementKind, options: ElementFingerprint) {
  return getDefaultElementConfig(kind, options).attributes;
}

/**
 * Returns the default style for a new element of the given kind.
 *
 * @param kind - The kind of element being created
 * @param options - Fingerprint with the tag or base component to look up
 * @returns The default ElementStyle for the element
 */
export function getDefaultElementStyle(kind: ElementKind, options: ElementFingerprint) {
  return getDefaultElementConfig(kind, options).style;
}

/**
 * looks through the svgElementDefaults to get the position attributes for the specific tag
 * and if they should be on the .style attribute or a direct attribute
 *
 * @param tag - The SVG or HTML tag to inspect
 * @returns Position attribute names or a style mapping, with the unused form set to null
 */
export function toPositionAttributes(tag: SvgTag | HtmlTag | null): {
  attributes: {
    left: "x" | "cx" | "left";
    top: "y" | "yx" | "top";
  } | null;
  style: ElementStyle | null;
} {
  if (tag && svgTags.includes(tag)) {
    if ("attributes" in svgElementDefaults[tag]) {
      if ("x" in svgElementDefaults[tag].attributes || "y" in svgElementDefaults[tag].attributes) {
        return { attributes: { left: "x", top: "y" }, style: null };
      }

      if (
        "cx" in svgElementDefaults[tag].attributes ||
        "cy" in svgElementDefaults[tag].attributes
      ) {
        return { attributes: { left: "cx", top: "cy" }, style: null };
      }
    }
  }

  // all html uses style not attributes
  return { style: { left: "left", top: "top" }, attributes: null };
}
