import type { AttributeValue, ElementAttributes, ElementRecord } from "$lib/elements/elementTypes";
import type { SvgTag } from "$lib/elements/svgTags";
import { formatLength, parseLength, unitOf } from "./moveableGeometry";
import { svgMoveableSupport, type SvgControlKind } from "./svgMoveable";

export type SvgGeometryControl = {
  kind: SvgControlKind;
  key: string;
  x: number;
  y: number;
  index?: number;
  label: string;
  cursor: string;
};

function num(value: AttributeValue | undefined, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function controlLength(
  value: AttributeValue | undefined,
  axis: "x" | "y",
  target: SVGElement | undefined,
) {
  if (!target) return num(value);
  return parseLength(typeof value === "string" ? value : num(value), axis, target);
}

function controlValue(
  value: number,
  authored: AttributeValue | undefined,
  axis: "x" | "y",
  target: SVGElement | undefined,
) {
  if (!target) return String(round(value));
  return formatLength(
    value,
    unitOf(typeof authored === "string" ? authored : "", ""),
    axis,
    target,
  );
}

function round(value: number) {
  return Number(value.toFixed(4));
}

function pointList(value: AttributeValue | undefined) {
  if (typeof value !== "string") return null;
  const tokens = value
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  if (tokens.length < 2 || tokens.length % 2 !== 0) return null;
  const points: Array<[number, number]> = [];
  for (let i = 0; i < tokens.length; i += 2) {
    const x = Number.parseFloat(tokens[i]);
    const y = Number.parseFloat(tokens[i + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    points.push([x, y]);
  }
  return points;
}

function pointsToString(points: Array<[number, number]>) {
  return points.map(([x, y]) => `${round(x)},${round(y)}`).join(" ");
}

export function supportsSvgGeometryControls(element: ElementRecord) {
  if (element.kind !== "svg" || !element.tag) return false;
  return (svgMoveableSupport[element.tag as SvgTag]?.controls.length ?? 0) > 0;
}

export function getSvgGeometryControls(
  element: ElementRecord,
  attributes: ElementAttributes = element.attributes,
  target?: SVGElement,
): SvgGeometryControl[] {
  if (!supportsSvgGeometryControls(element)) return [];
  const tag = element.tag as SvgTag;

  if (tag === "line") {
    return [
      {
        kind: "line-start",
        key: "line:start",
        x: controlLength(attributes.x1, "x", target),
        y: controlLength(attributes.y1, "y", target),
        label: "Move line start",
        cursor: "move",
      },
      {
        kind: "line-end",
        key: "line:end",
        x: controlLength(attributes.x2, "x", target),
        y: controlLength(attributes.y2, "y", target),
        label: "Move line end",
        cursor: "move",
      },
    ];
  }

  if (tag === "polyline" || tag === "polygon") {
    return (pointList(attributes.points) ?? []).map(([x, y], index) => ({
      kind: "point",
      key: `point:${index}`,
      index,
      x,
      y,
      label: `Move point ${index + 1}`,
      cursor: "move",
    }));
  }

  if (tag === "circle" || tag === "ellipse") {
    return [
      {
        kind: "center",
        key: `${tag}:center`,
        x: controlLength(attributes.cx, "x", target),
        y: controlLength(attributes.cy, "y", target),
        label: "Move center",
        cursor: "move",
      },
    ];
  }

  return [];
}

export function applySvgGeometryControlDrag(
  element: ElementRecord,
  baseAttributes: ElementAttributes,
  control: SvgGeometryControl,
  pointer: { x: number; y: number },
  target?: SVGElement,
): ElementAttributes | null {
  const attributes: ElementAttributes = { ...baseAttributes };
  const tag = element.tag as SvgTag;

  if (tag === "line") {
    if (control.kind === "line-start") {
      attributes.x1 = controlValue(pointer.x, attributes.x1, "x", target);
      attributes.y1 = controlValue(pointer.y, attributes.y1, "y", target);
      return attributes;
    }
    if (control.kind === "line-end") {
      attributes.x2 = controlValue(pointer.x, attributes.x2, "x", target);
      attributes.y2 = controlValue(pointer.y, attributes.y2, "y", target);
      return attributes;
    }
    return null;
  }

  if (tag === "polyline" || tag === "polygon") {
    if (control.kind !== "point") return null;
    const points = pointList(attributes.points);
    if (!points || !points[control.index ?? -1]) return null;
    points[control.index!] = [round(pointer.x), round(pointer.y)];
    attributes.points = pointsToString(points);
    return attributes;
  }

  if (tag === "circle" || tag === "ellipse") {
    if (control.kind !== "center") return null;
    attributes.cx = controlValue(pointer.x, attributes.cx, "x", target);
    attributes.cy = controlValue(pointer.y, attributes.cy, "y", target);
    return attributes;
  }

  return null;
}

export function getSvgScreenCTM(target: SVGElement) {
  if (target instanceof SVGGraphicsElement) return target.getScreenCTM();
  return target.ownerSVGElement?.getScreenCTM() ?? null;
}

export function getSvgCreatePointRoot(target: SVGElement) {
  return target.ownerSVGElement ?? (target instanceof SVGSVGElement ? target : null);
}

export function clientPointToSvg(target: SVGElement, clientX: number, clientY: number) {
  const svg = getSvgCreatePointRoot(target);
  const matrix = getSvgScreenCTM(target);
  if (!svg || !matrix) return null;
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  return point.matrixTransform(matrix.inverse());
}
