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

/**
 * Coerces an SVG attribute value to a finite number.
 *
 * @param value - Numeric or string attribute value
 * @param [fallback] - Value returned when parsing fails (defaults to 0)
 * @returns The parsed number or the fallback
 */
function num(value: AttributeValue | undefined, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

/**
 * Converts an attribute value into user-space length for a control handle.
 *
 * @param value - Attribute value to convert
 * @param axis - Axis used to resolve percentage lengths
 * @param target - Target SVG element, or undefined for raw values
 * @returns The length in user units
 */
function controlLength(
  value: AttributeValue | undefined,
  axis: "x" | "y",
  target: SVGElement | undefined,
) {
  if (!target) return num(value);
  return parseLength(typeof value === "string" ? value : num(value), axis, target);
}

/**
 * Formats a dragged control position back into an SVG attribute value.
 *
 * @param value - New position in user units
 * @param authored - Original authored attribute value, used to preserve units
 * @param axis - Axis used to format percentage lengths
 * @param target - Target SVG element, or undefined for plain values
 * @returns The formatted attribute value
 */
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

/**
 * Rounds a number to four decimal places.
 *
 * @param value - Number to round
 * @returns The rounded number
 */
function round(value: number) {
  return Number(value.toFixed(4));
}

/**
 * Parses an SVG points attribute into coordinate pairs.
 *
 * @param value - Raw points attribute value
 * @returns The coordinate pairs, or null when malformed
 */
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

/**
 * Serializes coordinate pairs into an SVG points attribute value.
 *
 * @param points - Coordinate pairs to serialize
 * @returns The serialized points string
 */
function pointsToString(points: Array<[number, number]>) {
  return points.map(([x, y]) => `${round(x)},${round(y)}`).join(" ");
}

/**
 * Checks whether an element supports draggable SVG geometry controls.
 *
 * @param element - Element to inspect
 * @returns True when the element has one or more geometry controls
 */
export function supportsSvgGeometryControls(element: ElementRecord) {
  if (element.kind !== "svg" || !element.tag) return false;
  return (svgMoveableSupport[element.tag as SvgTag]?.controls.length ?? 0) > 0;
}

/**
 * Builds the draggable control handles for an SVG element.
 *
 * @param element - SVG element to build controls for
 * @param [attributes] - Attributes to derive positions from (defaults to the element's)
 * @param target - Live SVG element used to resolve percentage lengths
 * @returns The control handles, or an empty array when unsupported
 */
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

/**
 * Applies a dragged geometry control position to a copy of the attributes.
 *
 * @param element - SVG element being edited
 * @param baseAttributes - Attributes captured at drag start
 * @param control - Control handle being dragged
 * @param pointer - Pointer position in user units
 * @param target - Live SVG element used to format lengths
 * @returns The updated attributes, or null when the drag is not applicable
 */
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

/**
 * Returns the screen coordinate matrix for an SVG element.
 *
 * @param target - SVG element to measure
 * @returns The screen CTM, or null when unavailable
 */
export function getSvgScreenCTM(target: SVGElement) {
  if (target instanceof SVGGraphicsElement) return target.getScreenCTM();
  return target.ownerSVGElement?.getScreenCTM() ?? null;
}

/**
 * Finds the root SVG element used to create SVG points.
 *
 * @param target - SVG element to inspect
 * @returns The root SVG element, or null when none exists
 */
export function getSvgCreatePointRoot(target: SVGElement) {
  return target.ownerSVGElement ?? (target instanceof SVGSVGElement ? target : null);
}

/**
 * Converts a client-space pointer position into the target's SVG user space.
 *
 * @param target - SVG element defining the target coordinate system
 * @param clientX - Pointer x position in client coordinates
 * @param clientY - Pointer y position in client coordinates
 * @returns The converted point, or null when the transform is unavailable
 */
export function clientPointToSvg(target: SVGElement, clientX: number, clientY: number) {
  const svg = getSvgCreatePointRoot(target);
  const matrix = getSvgScreenCTM(target);
  if (!svg || !matrix) return null;
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  return point.matrixTransform(matrix.inverse());
}
