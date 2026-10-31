import type { ElementAttributes, ElementKind, ElementStyle } from "./elementTypes";
import { baseComponents } from "./baseComponents";
import { htmlElementDefaults } from "./htmlElementDefaults";
import type { HtmlTag } from "./htmlTags";
import { svgElementDefaults } from "./svgElementDefaults";
import type { SvgTag } from "./svgTags";

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
