import type { ElementRecord } from "$lib/elements/elementTypes";
import { getEditorInstance } from "./editorContext";

export type MoveableElement = HTMLElement | SVGElement;
export type MoveableBox = {
  x: number;
  y: number;
  w: number;
  h: number;
  rotate: number;
  ox: number;
  oy: number;
};
type Axis = "x" | "y";
type Prop = "x" | "y" | "w" | "h";
export type MoveableUnits = Record<Prop, string> & { ox: string; oy: string };

export type GeometryChanges = {
  attributes?: Record<string, string>;
  style?: Record<string, string>;
};

const AXIS: Record<Prop, Axis> = { x: "x", y: "y", w: "x", h: "y" };
const EPS = 1e-1;
const POSITION_TAGS = new Set(["rect", "foreignobject", "use", "pattern", "text", "tspan"]);

/**
 * Checks whether a moveable element is an SVG element.
 * @param el - Element to test.
 * @returns True when the element is an SVGElement.
 */
function isSvgElement(el: MoveableElement): el is SVGElement {
  return typeof SVGElement !== "undefined" && el instanceof SVGElement;
}

/**
 * Reports whether an element is positioned by its centre coordinates.
 * @param el - Element to test.
 * @returns True for circle and ellipse elements.
 */
export function usesCenter(el: MoveableElement): boolean {
  return el.tagName === "circle" || el.tagName === "ellipse";
}

/**
 * Reports whether an SVG tag is positioned by its centre coordinates.
 * @param tag - SVG tag name.
 * @returns True for circle and ellipse tags.
 */
function usesCenterTag(tag: string | null | undefined): boolean {
  return tag === "circle" || tag === "ellipse";
}

/**
 * Reports whether an SVG tag stores position in x/y attributes.
 * @param tag - SVG tag name.
 * @returns True when the tag uses position attributes.
 */
function usesPositionAttributesTag(tag: string | null | undefined): boolean {
  return POSITION_TAGS.has((tag ?? "").toLowerCase());
}

/**
 * Reads an element attribute as a string.
 * @param element - Element record to read.
 * @param name - Attribute name.
 * @returns The attribute value, or null when unset.
 */
function attributeValue(element: ElementRecord, name: string) {
  const value = element.attributes[name];
  return value === undefined || value === null ? null : String(value);
}

/**
 * Reads an element style property.
 * @param element - Element record to read.
 * @param name - Style property name.
 * @returns The style value, or null when unset.
 */
function styleValue(element: ElementRecord, name: string) {
  return element.style[name] ?? null;
}

/**
 * Parses the rotation angle from an element's style.
 * @param element - Element record to read.
 * @returns The rotation in degrees.
 */
function parseRotate(element: ElementRecord): number {
  const rotate = styleValue(element, "rotate")?.trim();
  if (rotate) {
    const value = Number.parseFloat(rotate);
    if (Number.isFinite(value)) return value;
  }
  const transform = styleValue(element, "transform") ?? "";
  return Number.parseFloat(/rotate\(([-\d.]+)deg\)/.exec(transform)?.[1] ?? "0");
}

/**
 * Checks whether two values differ by more than the geometry epsilon.
 * @param a - First value.
 * @param b - Second value.
 * @returns True when the values differ beyond tolerance.
 */
function changed(a: number, b: number): boolean {
  return Math.abs(a - b) > EPS;
}

/**
 * Extracts the unit suffix from a CSS length value.
 * @param raw - Raw CSS length.
 * @param fallback - Unit returned when no suffix is present.
 * @returns The detected or fallback unit.
 */
export function unitOf(raw: string | null | undefined, fallback: string): string {
  return /^-?[\d.]+([a-z%]*)$/i.exec(raw?.trim() ?? "")?.[1] ?? fallback;
}

/**
 * Computes how many pixels one unit represents along an axis.
 * @param unit - CSS unit.
 * @param axis - Axis being measured.
 * @param el - Element used as the measurement reference.
 * @returns Pixels per unit.
 */
function pxPer(unit: string, axis: Axis, el: MoveableElement): number {
  switch (unit) {
    case "":
    case "px":
      return 1;
    case "%": {
      const svg = isSvgElement(el) ? el.ownerSVGElement : null;
      if (svg) {
        return axis === "x"
          ? (svg.viewBox.baseVal.width || svg.clientWidth) / 100
          : (svg.viewBox.baseVal.height || svg.clientHeight) / 100;
      }
      const parent = (el as HTMLElement).offsetParent;
      return (axis === "x" ? (parent?.clientWidth ?? 0) : (parent?.clientHeight ?? 0)) / 100;
    }
    case "rem":
      return Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    case "em":
      return Number.parseFloat(getComputedStyle(el).fontSize);
    case "vw":
      return innerWidth / 100;
    case "vh":
      return innerHeight / 100;
    default:
      return 1;
  }
}

/**
 * Formats a pixel length as a snapped CSS length in the given unit.
 * @param px - Length in pixels.
 * @param unit - Target CSS unit.
 * @param axis - Axis being formatted.
 * @param el - Element used as the measurement reference.
 * @returns The formatted CSS length.
 */
export function formatLength(px: number, unit: string, axis: Axis, el: MoveableElement): string {
  const snapped = toSnapGrid(px);
  const value = +(snapped / (pxPer(unit, axis, el) || 1)).toFixed(4);
  return `${value}${unit}`;
}

/**
 * Parses a CSS length into pixels.
 * @param raw - Raw length value.
 * @param axis - Axis being measured.
 * @param el - Element used as the measurement reference.
 * @returns The length in pixels, or 0 when invalid.
 */
export function parseLength(
  raw: string | number | null | undefined,
  axis: Axis,
  el: MoveableElement,
): number {
  if (typeof raw === "number") return raw;
  const value = Number.parseFloat(raw?.trim() ?? "");
  if (!Number.isFinite(value)) return 0;
  return value * pxPer(unitOf(raw === null || raw === undefined ? "" : String(raw), ""), axis, el);
}

/**
 * Snaps a pixel value to the active editor grid when snapping is enabled.
 * @param px - Pixel value to snap.
 * @returns The snapped pixel value.
 */
export function toSnapGrid(px: number): number {
  const grid = getEditorInstance()?.grid;

  if (!grid?.enabled || grid.spacing <= 0) return px;

  return Math.round(px / grid.spacing) * grid.spacing;
}

/**
 * Snaps a bounding box position and size to the active editor grid.
 * @param box - Box to snap.
 * @returns The snapped box.
 */
export function snapBoxToGrid(box: MoveableBox): MoveableBox {
  const grid = getEditorInstance()?.grid;
  if (!grid?.enabled || grid.spacing <= 0) return box;

  return {
    ...box,
    x: toSnapGrid(box.x),
    y: toSnapGrid(box.y),
    w: Math.max(grid.spacing, toSnapGrid(box.w)),
    h: Math.max(grid.spacing, toSnapGrid(box.h)),
  };
}

/**
 * Formats a box property as a CSS length using its configured unit.
 * @param px - Pixel value.
 * @param prop - Box property being formatted.
 * @param units - Units per box property.
 * @param el - Element used as the measurement reference.
 * @returns The formatted CSS length.
 */
function fmt(px: number, prop: Prop, units: MoveableUnits, el: MoveableElement): string {
  return formatLength(px, units[prop], AXIS[prop], el);
}

const KEYWORD: Record<string, string> = {
  left: "0%",
  top: "0%",
  center: "50%",
  right: "100%",
  bottom: "100%",
};

/**
 * Splits a transform-origin value into x and y tokens with keyword expansion.
 * @param raw - Raw transform-origin value.
 * @returns The x and y origin tokens.
 */
function originTokens(raw: string): [string, string] {
  const tokens = raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => KEYWORD[token] ?? token);
  return [tokens[0] ?? "50%", tokens[1] ?? "50%"];
}

/**
 * Converts a transform-origin token into pixels.
 * @param token - Origin token.
 * @param axis - Axis being measured.
 * @param el - Element used as the measurement reference.
 * @param w - Reference width.
 * @param h - Reference height.
 * @returns The origin offset in pixels.
 */
function originPx(token: string, axis: Axis, el: MoveableElement, w: number, h: number): number {
  const value = Number.parseFloat(token);
  const unit = unitOf(token, "px");
  if (unit === "%") return (value / 100) * (axis === "x" ? w : h);
  return value * pxPer(unit, axis, el);
}

/**
 * Formats a transform-origin offset as a CSS length in the given unit.
 * @param px - Origin offset in pixels.
 * @param axis - Axis being formatted.
 * @param unit - Target CSS unit.
 * @param el - Element used as the measurement reference.
 * @param w - Reference width.
 * @param h - Reference height.
 * @returns The formatted origin token.
 */
function fmtOrigin(
  px: number,
  axis: Axis,
  unit: string,
  el: MoveableElement,
  w: number,
  h: number,
): string {
  const size = axis === "x" ? w : h;
  const value = unit === "%" ? (px / (size || 1)) * 100 : px / (pxPer(unit, axis, el) || 1);
  return `${+value.toFixed(4)}${unit}`;
}

type OriginReference = {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
};

/**
 * Resolves the coordinate reference used for an element's transform origin.
 * @param element - Element record being measured.
 * @param el - Live element being measured.
 * @param width - Fallback width.
 * @param height - Fallback height.
 * @returns The reference size and offset.
 */
function originReference(
  element: ElementRecord,
  el: MoveableElement,
  width: number,
  height: number,
): OriginReference {
  if (element.kind !== "svg") return { width, height, offsetX: 0, offsetY: 0 };

  const transformBox = styleValue(element, "transform-box")?.trim();
  if (transformBox === "fill-box" || transformBox === "stroke-box") {
    return { width, height, offsetX: 0, offsetY: 0 };
  }

  const svg = isSvgElement(el) ? (el instanceof SVGSVGElement ? el : el.ownerSVGElement) : null;
  if (!svg) return { width, height, offsetX: 0, offsetY: 0 };

  const viewBox = svg.viewBox?.baseVal;
  const viewWidth = viewBox?.width || svg.clientWidth || width;
  const viewHeight = viewBox?.height || svg.clientHeight || height;
  const measured = measuredSize(el);

  return {
    width: viewWidth,
    height: viewHeight,
    offsetX: measured.x - (viewBox?.x || 0),
    offsetY: measured.y - (viewBox?.y || 0),
  };
}

/**
 * Reads an element's transform-origin as pixel offsets.
 * @param element - Element record to read.
 * @param el - Live element used for measurement.
 * @param w - Element width.
 * @param h - Element height.
 * @returns The origin offsets in pixels.
 */
function readOrigin(element: ElementRecord, el: MoveableElement, w: number, h: number) {
  const reference = originReference(element, el, w, h);
  const [originX, originY] = originTokens(styleValue(element, "transform-origin") ?? "50% 50%");

  return {
    ox: originPx(originX, "x", el, reference.width, reference.height) - reference.offsetX,
    oy: originPx(originY, "y", el, reference.width, reference.height) - reference.offsetY,
  };
}

const LENGTH_PATTERN = /^[-+]?\d*\.?\d+(?:[a-z%]+)?$/i;

/**
 * Shifts a length-based attribute by a pixel delta while preserving its unit.
 * @param element - Element record to read.
 * @param name - Attribute name.
 * @param axis - Axis being shifted.
 * @param delta - Pixel delta to apply.
 * @param el - Element used as the measurement reference.
 * @returns The shifted attribute value, or null when not a length.
 */
function shiftLengthAttribute(
  element: ElementRecord,
  name: string,
  axis: Axis,
  delta: number,
  el: MoveableElement,
): string | null {
  const raw = attributeValue(element, name);
  if (raw === null || !LENGTH_PATTERN.test(raw.trim())) return null;

  const unit = unitOf(raw, "");
  return formatLength(parseLength(raw, axis, el) + delta, unit, axis, el);
}

/**
 * Shifts every coordinate pair in a points attribute.
 * @param raw - Raw points attribute.
 * @param dx - Horizontal delta in pixels.
 * @param dy - Vertical delta in pixels.
 * @returns The shifted points, or null when malformed.
 */
function shiftPointsAttribute(raw: string | null, dx: number, dy: number): string | null {
  if (raw === null) return null;

  const tokens = raw
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  if (tokens.length < 2 || tokens.length % 2 !== 0) return null;

  const shifted: string[] = [];
  for (let index = 0; index < tokens.length; index += 2) {
    const x = Number.parseFloat(tokens[index]);
    const y = Number.parseFloat(tokens[index + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    shifted.push(`${+(x + dx).toFixed(4)},${+(y + dy).toFixed(4)}`);
  }
  return shifted.join(" ");
}

/**
 * Reads an element's translate style as pixel offsets.
 * @param element - Element record to read.
 * @param el - Element used for measurement.
 * @returns The x and y translation in pixels.
 */
function readTranslate(element: ElementRecord, el: MoveableElement): [number, number] {
  const raw = (styleValue(element, "translate") ?? "").trim();
  if (!raw || raw === "none") return [0, 0];
  const tokens = raw.split(/\s+/).filter(Boolean);
  return [parseLength(tokens[0], "x", el), parseLength(tokens[1] ?? "0", "y", el)];
}

/**
 * Measures an element's rendered size and position.
 * @param el - Element to measure.
 * @returns The measured width, height, x, and y.
 */
function measuredSize(el: MoveableElement) {
  if (typeof SVGGraphicsElement !== "undefined" && el instanceof SVGGraphicsElement) {
    const box = el.getBBox();
    return { width: box.width, height: box.height, x: box.x, y: box.y };
  }
  const html = el as HTMLElement;
  return {
    width: html.offsetWidth ?? 0,
    height: html.offsetHeight ?? 0,
    x: html.offsetLeft ?? 0,
    y: html.offsetTop ?? 0,
  };
}

/**
 * Reads a length attribute as pixels.
 * @param element - Element record to read.
 * @param name - Attribute name.
 * @param axis - Axis being measured.
 * @param el - Element used as the measurement reference.
 * @returns The attribute length in pixels.
 */
function readAttributeLength(
  element: ElementRecord,
  name: string,
  axis: Axis,
  el: MoveableElement,
) {
  return parseLength(attributeValue(element, name), axis, el);
}

/**
 * Reports whether an SVG element is nested inside another element.
 * @param element - Element record to test.
 * @returns True when the element has a parent.
 */
function isNestedSvg(element: ElementRecord) {
  return element.parentId !== null;
}

/**
 * Reads an SVG element's geometry into a moveable box.
 * @param element - Element record to read.
 * @param el - Live SVG element used for measurement.
 * @returns The element's box.
 */
function readSvgBox(element: ElementRecord, el: MoveableElement): MoveableBox {
  const tag = (element.tag ?? "").toLowerCase();
  let measured: ReturnType<typeof measuredSize> | null = null;
  /**
   * Lazily measures the element once and caches the result.
   * @returns The measured element size and position.
   */
  const measure = () => (measured ??= measuredSize(el));

  let w: number;
  let h: number;
  let x: number;
  let y: number;

  if (usesCenterTag(tag)) {
    const radius = readAttributeLength(element, tag === "circle" ? "r" : "rx", "x", el);
    const radiusY = tag === "circle" ? radius : readAttributeLength(element, "ry", "y", el);
    w = radius * 2;
    h = radiusY * 2;
    x = readAttributeLength(element, "cx", "x", el) - w / 2;
    y = readAttributeLength(element, "cy", "y", el) - h / 2;
  } else {
    const styleWidth = styleValue(element, "width");
    const styleHeight = styleValue(element, "height");
    w =
      styleWidth !== null
        ? parseLength(styleWidth, "x", el)
        : readAttributeLength(element, "width", "x", el) || measure().width;
    h =
      styleHeight !== null
        ? parseLength(styleHeight, "y", el)
        : readAttributeLength(element, "height", "y", el) || measure().height;

    if (tag === "svg" ? isNestedSvg(element) : usesPositionAttributesTag(tag)) {
      x =
        attributeValue(element, "x") !== null
          ? readAttributeLength(element, "x", "x", el)
          : measure().x;
      y =
        attributeValue(element, "y") !== null
          ? readAttributeLength(element, "y", "y", el)
          : measure().y;
    } else {
      [x, y] = readTranslate(element, el);
    }
  }

  const { ox, oy } = readOrigin(element, el, w, h);

  return {
    x,
    y,
    w,
    h,
    rotate: parseRotate(element),
    ox,
    oy,
  };
}

/**
 * Reads an element's geometry into a moveable box.
 * @param element - Element record to read.
 * @param el - Live element used for measurement.
 * @returns The element's box.
 */
export function readBox(element: ElementRecord, el: MoveableElement): MoveableBox {
  if (element.kind === "svg") return readSvgBox(element, el);

  let measured: ReturnType<typeof measuredSize> | null = null;
  /**
   * Lazily measures the element once and caches the result.
   * @returns The measured element size and position.
   */
  const measure = () => (measured ??= measuredSize(el));
  const left = styleValue(element, "left");
  const top = styleValue(element, "top");
  const width = styleValue(element, "width");
  const height = styleValue(element, "height");
  const w = width !== null ? parseLength(width, "x", el) : measure().width;
  const h = height !== null ? parseLength(height, "y", el) : measure().height;
  const { ox, oy } = readOrigin(element, el, w, h);

  return {
    x: left !== null ? parseLength(left, "x", el) : measure().x,
    y: top !== null ? parseLength(top, "y", el) : measure().y,
    w,
    h,
    rotate: parseRotate(element),
    ox,
    oy,
  };
}

/**
 * Resolves the units used for an element's box properties.
 * @param element - Element record to inspect.
 * @returns The units per box property and origin.
 */
export function readUnits(element: ElementRecord): MoveableUnits {
  const [originX, originY] = originTokens(styleValue(element, "transform-origin") ?? "50% 50%");
  const ox = unitOf(originX, "%");
  const oy = unitOf(originY, "%");

  if (element.kind === "svg") {
    const tag = (element.tag ?? "").toLowerCase();
    const center = usesCenterTag(tag);
    const position = usesPositionAttributesTag(tag) || (tag === "svg" && isNestedSvg(element));
    if (center || position) {
      return {
        x: unitOf(attributeValue(element, center ? "cx" : "x"), ""),
        y: unitOf(attributeValue(element, center ? "cy" : "y"), ""),
        w: unitOf(styleValue(element, "width"), "px"),
        h: unitOf(styleValue(element, "height"), "px"),
        ox,
        oy,
      };
    }
    return {
      x: "px",
      y: "px",
      w: unitOf(styleValue(element, "width"), "px"),
      h: unitOf(styleValue(element, "height"), "px"),
      ox,
      oy,
    };
  }

  return {
    x: unitOf(styleValue(element, "left"), "px"),
    y: unitOf(styleValue(element, "top"), "px"),
    w: unitOf(styleValue(element, "width"), "px"),
    h: unitOf(styleValue(element, "height"), "px"),
    ox,
    oy,
  };
}

/**
 * Computes attribute and style writes for a box geometry change.
 * @param element - Element being changed.
 * @param base - Starting box.
 * @param next - Requested box.
 * @param units - Units per box property.
 * @param el - Live element used for measurement.
 * @param [wholeBox] - Snap the whole box instead of individual edits (defaults to false).
 * @returns The attribute and style changes to apply.
 */
function boxWrites(
  element: ElementRecord,
  base: MoveableBox,
  next: MoveableBox,
  units: MoveableUnits,
  el: MoveableElement,
  wholeBox = false,
): GeometryChanges {
  const target = wholeBox ? snapBoxToGrid(next) : { ...next };

  if (!wholeBox) {
    const baseRight = base.x + base.w;
    const baseBottom = base.y + base.h;

    if (changed(base.w, target.w)) {
      if (changed(base.x, target.x)) {
        target.x = toSnapGrid(target.x);
        target.w = Math.max(0, baseRight - target.x);
      } else {
        target.x = base.x;
        target.w = Math.max(0, toSnapGrid(base.x + target.w) - target.x);
      }
    } else if (changed(base.x, target.x)) {
      target.x = toSnapGrid(target.x);
    }

    if (changed(base.h, target.h)) {
      if (changed(base.y, target.y)) {
        target.y = toSnapGrid(target.y);
        target.h = Math.max(0, baseBottom - target.y);
      } else {
        target.y = base.y;
        target.h = Math.max(0, toSnapGrid(base.y + target.h) - target.y);
      }
    } else if (changed(base.y, target.y)) {
      target.y = toSnapGrid(target.y);
    }
  }

  const dx = changed(base.x, target.x);
  const dy = changed(base.y, target.y);
  const dw = changed(base.w, target.w);
  const dh = changed(base.h, target.h);
  const dr = changed(base.rotate, target.rotate);
  const dorigin = changed(base.ox, target.ox) || changed(base.oy, target.oy);
  const style: Record<string, string> = {};
  const attributes: Record<string, string> = {};

  const tag = (element.tag ?? "").toLowerCase();

  if (usesCenterTag(tag)) {
    if (tag === "circle") {
      if (dw || dh) attributes.r = fmt((dh ? target.h : target.w) / 2, "w", units, el);
    } else {
      if (dw) attributes.rx = fmt(target.w / 2, "w", units, el);
      if (dh) attributes.ry = fmt(target.h / 2, "h", units, el);
    }
  } else {
    if (dw) attributes.width = fmt(target.w, "w", units, el);
    if (dh) attributes.height = fmt(target.h, "h", units, el);
  }

  if (dorigin) {
    const reference = originReference(element, el, target.w, target.h);
    style["transform-origin"] = `${fmtOrigin(
      target.ox + reference.offsetX,
      "x",
      units.ox,
      el,
      reference.width,
      reference.height,
    )} ${fmtOrigin(
      target.oy + reference.offsetY,
      "y",
      units.oy,
      el,
      reference.width,
      reference.height,
    )}`;
  }

  if (dr) style.rotate = `${target.rotate}deg`;

  if (element.kind === "svg") {
    const center = usesCenterTag(tag);
    const position = usesPositionAttributesTag(tag) || (tag === "svg" && isNestedSvg(element));
    if (center || position) {
      if (dx || (center && dw)) {
        attributes[center ? "cx" : "x"] = fmt(
          center ? target.x + target.w / 2 : target.x,
          "x",
          units,
          el,
        );
      }
      if (dy || (center && dh)) {
        attributes[center ? "cy" : "y"] = fmt(
          center ? target.y + target.h / 2 : target.y,
          "y",
          units,
          el,
        );
      }
    } else if (tag === "line" && (dx || dy)) {
      const deltaX = target.x - base.x;
      const deltaY = target.y - base.y;
      const x1 = shiftLengthAttribute(element, "x1", "x", deltaX, el);
      const y1 = shiftLengthAttribute(element, "y1", "y", deltaY, el);
      const x2 = shiftLengthAttribute(element, "x2", "x", deltaX, el);
      const y2 = shiftLengthAttribute(element, "y2", "y", deltaY, el);

      if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
        attributes.x1 = x1;
        attributes.y1 = y1;
        attributes.x2 = x2;
        attributes.y2 = y2;
        if (styleValue(element, "translate") !== null) style.translate = "";
      } else {
        style.translate = `${fmt(target.x, "x", units, el)} ${fmt(target.y, "y", units, el)}`;
      }
    } else if ((tag === "polyline" || tag === "polygon") && (dx || dy)) {
      const points = shiftPointsAttribute(
        attributeValue(element, "points"),
        target.x - base.x,
        target.y - base.y,
      );

      if (points !== null) {
        attributes.points = points;
        if (styleValue(element, "translate") !== null) style.translate = "";
      } else {
        style.translate = `${fmt(target.x, "x", units, el)} ${fmt(target.y, "y", units, el)}`;
      }
    } else if (dx || dy) {
      style.translate = `${fmt(target.x, "x", units, el)} ${fmt(target.y, "y", units, el)}`;
    }
  } else {
    if (dx) style.left = fmt(target.x, "x", units, el);
    if (dy) style.top = fmt(target.y, "y", units, el);
  }

  return {
    ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
    ...(Object.keys(style).length > 0 ? { style } : {}),
  };
}

/**
 * Captures geometry writes for a box change, or null when nothing changed.
 * @param element - Element being changed.
 * @param start - Starting box.
 * @param current - Current box.
 * @param units - Units per box property.
 * @param el - Live element used for measurement.
 * @param [wholeBox] - Snap the whole box instead of individual edits (defaults to false).
 * @returns The changes to apply, or null when the box is unchanged.
 */
export function captureBoxChanges(
  element: ElementRecord,
  start: MoveableBox,
  current: MoveableBox,
  units: MoveableUnits,
  el: MoveableElement,
  wholeBox = false,
): GeometryChanges | null {
  const changes = boxWrites(element, start, current, units, el, wholeBox);
  return changes.attributes || changes.style ? changes : null;
}

/**
 * Applies a drag delta to a box.
 * @param start - Starting box.
 * @param dist - Drag distance as [x, y].
 * @param el - Live element being dragged.
 * @param [zoom] - Canvas zoom factor (defaults to 1).
 * @returns The dragged box.
 */
export function applyDrag(
  start: MoveableBox,
  dist: number[],
  el: MoveableElement,
  zoom = 1,
): MoveableBox {
  return {
    ...start,
    x: start.x + dist[0],
    y: start.y + dist[1],
  };
}

/**
 * Applies a resize delta to a box.
 * @param start - Starting box.
 * @param current - Current box.
 * @param sizeDist - Size delta as [w, h].
 * @param dragDelta - Position delta as [x, y].
 * @param el - Live element being resized.
 * @param [zoom] - Canvas zoom factor (defaults to 1).
 * @returns The resized box.
 */
export function applyResize(
  start: MoveableBox,
  current: MoveableBox,
  sizeDist: number[],
  dragDelta: number[],
  el: MoveableElement,
  zoom = 1,
): MoveableBox {
  return {
    ...current,
    w: start.w + sizeDist[0],
    h: start.h + sizeDist[1],
    x: current.x + dragDelta[0],
    y: current.y + dragDelta[1],
  };
}

/**
 * Applies a rotation angle to a box.
 * @param box - Box to rotate.
 * @param rotation - Rotation in degrees.
 * @returns The rotated box.
 */
export function applyRotate(box: MoveableBox, rotation: number): MoveableBox {
  return { ...box, rotate: rotation };
}

/**
 * Computes the box position adjustment for a transform-origin move.
 * @param base - Reference box.
 * @param ox - New origin x.
 * @param oy - New origin y.
 * @returns The origin and adjusted position.
 */
function originPatch(base: MoveableBox, ox: number, oy: number): Partial<MoveableBox> {
  const angle = (base.rotate * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = base.ox - ox;
  const dy = base.oy - oy;
  return {
    ox,
    oy,
    x: base.x + dx - (cos * dx - sin * dy),
    y: base.y + dy - (sin * dx + cos * dy),
  };
}

/**
 * Applies a transform-origin drag to a box.
 * @param box - Current box.
 * @param start - Starting box.
 * @param origin - New origin as [x, y].
 * @returns The box with the updated origin and position.
 */
export function applyOriginDrag(
  box: MoveableBox,
  start: MoveableBox,
  origin: number[],
): MoveableBox {
  return { ...box, ...originPatch(start, origin[0], origin[1]) };
}
