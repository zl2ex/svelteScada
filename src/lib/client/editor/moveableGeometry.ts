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

function isSvgElement(el: MoveableElement): el is SVGElement {
  return typeof SVGElement !== "undefined" && el instanceof SVGElement;
}

export function usesCenter(el: MoveableElement): boolean {
  return el.tagName === "circle" || el.tagName === "ellipse";
}

function usesCenterTag(tag: string | null | undefined): boolean {
  return tag === "circle" || tag === "ellipse";
}

function usesPositionAttributesTag(tag: string | null | undefined): boolean {
  return POSITION_TAGS.has((tag ?? "").toLowerCase());
}

function attributeValue(element: ElementRecord, name: string) {
  const value = element.attributes[name];
  return value === undefined || value === null ? null : String(value);
}

function styleValue(element: ElementRecord, name: string) {
  return element.style[name] ?? null;
}

function parseRotate(element: ElementRecord): number {
  const rotate = styleValue(element, "rotate")?.trim();
  if (rotate) {
    const value = Number.parseFloat(rotate);
    if (Number.isFinite(value)) return value;
  }
  const transform = styleValue(element, "transform") ?? "";
  return Number.parseFloat(/rotate\(([-\d.]+)deg\)/.exec(transform)?.[1] ?? "0");
}

function changed(a: number, b: number): boolean {
  return Math.abs(a - b) > EPS;
}

function unitsPerPx(el: MoveableElement, zoom = 1): number {
  if (!isSvgElement(el)) return 1 / zoom;
  const matrix = el.ownerSVGElement?.getScreenCTM();
  return matrix?.a ? 1 / matrix.a : 1;
}

export function unitOf(raw: string | null | undefined, fallback: string): string {
  return /^-?[\d.]+([a-z%]*)$/i.exec(raw?.trim() ?? "")?.[1] ?? fallback;
}

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

export function formatLength(px: number, unit: string, axis: Axis, el: MoveableElement): string {
  const snapped = toSnapGrid(px);
  const value = +(snapped / (pxPer(unit, axis, el) || 1)).toFixed(4);
  return `${value}${unit}`;
}

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

function toSnapGrid(px: number): number {
  const grid = getEditorInstance()?.grid;

  if (!grid?.enabled || grid.spacing <= 0) return px;

  return Math.round(px / grid.spacing) * grid.spacing;
}

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

function originTokens(raw: string): [string, string] {
  const tokens = raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => KEYWORD[token] ?? token);
  return [tokens[0] ?? "50%", tokens[1] ?? "50%"];
}

function originPx(token: string, axis: Axis, el: MoveableElement, w: number, h: number): number {
  const value = Number.parseFloat(token);
  const unit = unitOf(token, "px");
  if (unit === "%") return (value / 100) * (axis === "x" ? w : h);
  return value * pxPer(unit, axis, el);
}

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

function readOrigin(element: ElementRecord, el: MoveableElement, w: number, h: number) {
  const reference = originReference(element, el, w, h);
  const [originX, originY] = originTokens(styleValue(element, "transform-origin") ?? "50% 50%");

  return {
    ox: originPx(originX, "x", el, reference.width, reference.height) - reference.offsetX,
    oy: originPx(originY, "y", el, reference.width, reference.height) - reference.offsetY,
  };
}

const LENGTH_PATTERN = /^[-+]?\d*\.?\d+(?:[a-z%]+)?$/i;

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

function readTranslate(element: ElementRecord, el: MoveableElement): [number, number] {
  const raw = (styleValue(element, "translate") ?? "").trim();
  if (!raw || raw === "none") return [0, 0];
  const tokens = raw.split(/\s+/).filter(Boolean);
  return [parseLength(tokens[0], "x", el), parseLength(tokens[1] ?? "0", "y", el)];
}

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

function readAttributeLength(
  element: ElementRecord,
  name: string,
  axis: Axis,
  el: MoveableElement,
) {
  return parseLength(attributeValue(element, name), axis, el);
}

function isNestedSvg(element: ElementRecord) {
  return element.parentId !== null;
}

function readSvgBox(element: ElementRecord, el: MoveableElement): MoveableBox {
  const tag = (element.tag ?? "").toLowerCase();
  let measured: ReturnType<typeof measuredSize> | null = null;
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

export function readBox(element: ElementRecord, el: MoveableElement): MoveableBox {
  if (element.kind === "svg") return readSvgBox(element, el);

  let measured: ReturnType<typeof measuredSize> | null = null;
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

function boxWrites(
  element: ElementRecord,
  base: MoveableBox,
  next: MoveableBox,
  units: MoveableUnits,
  el: MoveableElement,
): GeometryChanges {
  const dx = changed(base.x, next.x);
  const dy = changed(base.y, next.y);
  const dw = changed(base.w, next.w);
  const dh = changed(base.h, next.h);
  const dr = changed(base.rotate, next.rotate);
  const dorigin = changed(base.ox, next.ox) || changed(base.oy, next.oy);
  const style: Record<string, string> = {};
  const attributes: Record<string, string> = {};

  const tag = (element.tag ?? "").toLowerCase();

  // TD WIP center svg tags circle and elipse resize
  if (usesCenterTag(tag)) {
    if (dw) {
      //next.h = next.w;
      attributes.r = fmt(next.w / 2, "w", units, el);
    }

    if (dh) {
      //next.w = next.h;
      attributes.r = fmt(next.h / 2, "h", units, el);
    }
    delete attributes.width;
    delete attributes.height;
  } else {
    if (dw) style.width = fmt(next.w, "w", units, el);
    if (dh) style.height = fmt(next.h, "h", units, el);
  }

  if (dorigin) {
    const reference = originReference(element, el, next.w, next.h);
    style["transform-origin"] = `${fmtOrigin(
      next.ox + reference.offsetX,
      "x",
      units.ox,
      el,
      reference.width,
      reference.height,
    )} ${fmtOrigin(
      next.oy + reference.offsetY,
      "y",
      units.oy,
      el,
      reference.width,
      reference.height,
    )}`;
  }

  if (dr) style.rotate = `${next.rotate}deg`;

  if (element.kind === "svg") {
    const center = usesCenterTag(tag);
    const position = usesPositionAttributesTag(tag) || (tag === "svg" && isNestedSvg(element));
    if (center || position) {
      if (dx || (center && dw)) {
        attributes[center ? "cx" : "x"] = fmt(
          center ? next.x + next.w / 2 : next.x,
          "x",
          units,
          el,
        );
      }
      if (dy || (center && dh)) {
        attributes[center ? "cy" : "y"] = fmt(
          center ? next.y + next.h / 2 : next.y,
          "y",
          units,
          el,
        );
      }
    } else if (tag === "line" && (dx || dy)) {
      const deltaX = next.x - base.x;
      const deltaY = next.y - base.y;
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
        style.translate = `${fmt(next.x, "x", units, el)} ${fmt(next.y, "y", units, el)}`;
      }
    } else if ((tag === "polyline" || tag === "polygon") && (dx || dy)) {
      const points = shiftPointsAttribute(
        attributeValue(element, "points"),
        next.x - base.x,
        next.y - base.y,
      );

      if (points !== null) {
        attributes.points = points;
        if (styleValue(element, "translate") !== null) style.translate = "";
      } else {
        style.translate = `${fmt(next.x, "x", units, el)} ${fmt(next.y, "y", units, el)}`;
      }
    } else if (dx || dy) {
      style.translate = `${fmt(next.x, "x", units, el)} ${fmt(next.y, "y", units, el)}`;
    }
  } else {
    if (dx) style.left = fmt(next.x, "x", units, el);
    if (dy) style.top = fmt(next.y, "y", units, el);
  }

  return {
    ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
    ...(Object.keys(style).length > 0 ? { style } : {}),
  };
}

export function captureBoxChanges(
  element: ElementRecord,
  start: MoveableBox,
  current: MoveableBox,
  units: MoveableUnits,
  el: MoveableElement,
): GeometryChanges | null {
  const changes = boxWrites(element, start, current, units, el);
  return changes.attributes || changes.style ? changes : null;
}

export function applyDrag(
  start: MoveableBox,
  dist: number[],
  el: MoveableElement,
  zoom = 1,
): MoveableBox {
  const scale = unitsPerPx(el, zoom);
  return {
    ...start,
    x: start.x + dist[0] * scale,
    y: start.y + dist[1] * scale,
  };
}

export function applyResize(
  box: MoveableBox,
  width: number,
  height: number,
  dragDelta: number[],
  el: MoveableElement,
  zoom = 1,
): MoveableBox {
  const sizeScale = isSvgElement(el) ? unitsPerPx(el) : 1;
  const deltaScale = unitsPerPx(el, zoom);
  return {
    ...box,
    w: width * sizeScale,
    h: height * sizeScale,
    x: box.x + dragDelta[0] * deltaScale,
    y: box.y + dragDelta[1] * deltaScale,
  };
}

export function applyRotate(box: MoveableBox, rotation: number): MoveableBox {
  return { ...box, rotate: rotation };
}

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

export function applyOriginDrag(
  box: MoveableBox,
  start: MoveableBox,
  origin: number[],
): MoveableBox {
  return { ...box, ...originPatch(start, origin[0], origin[1]) };
}
