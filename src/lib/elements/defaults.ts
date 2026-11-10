import type { ElementAttributes, ElementKind, ElementStyle } from "./elementTypes";
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
  style?: ElementStyle;
};

export type ElementDefaults = {
  attributes: ElementAttributes;
  style: ElementStyle;
};

// style wins if duplicate attribue names
function normalizeDefaults(defaults: ElementDefaultsInput): ElementDefaults {
  const style = { ...defaults.style };
  const attributes = { ...defaults.attributes };

  for (const key of Object.keys(style)) {
    delete attributes[key];
  }

  return { attributes, style };
}

function getHtmlDefaults(tag: string | null | undefined) {
  if (!tag) return {};
  return htmlElementDefaults[tag as HtmlTag] ?? {};
}

function getSvgDefaults(tag: string | null | undefined) {
  if (!tag) return {};
  return svgElementDefaults[tag as SvgTag] ?? {};
}

function getBaseComponentDefaults(baseComponent: string | null | undefined) {
  if (!baseComponent) return {};
  return baseComponents[baseComponent]?.defaultAttributes ?? {};
}

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
      return normalizeDefaults({ attributes: getBaseComponentDefaults(options.baseComponent) });
    case "user-component":
      return normalizeDefaults({});
  }
}

export function getDefaultElementAttributes(kind: ElementKind, options: ElementFingerprint) {
  return getDefaultElementConfig(kind, options).attributes;
}

export function getDefaultElementStyle(kind: ElementKind, options: ElementFingerprint) {
  return getDefaultElementConfig(kind, options).style;
}

/**
 *  looks through the svgElementDefaults to get the position attributes for the specific tag and if they should be on the .style attribute or a direct attribute
 * @param tag
 * @returns
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
