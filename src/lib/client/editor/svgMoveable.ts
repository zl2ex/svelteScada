import type { AttributeValue, ElementAttributes, ElementRecord } from "$lib/elements/elementTypes";
import type { SvgTag } from "$lib/elements/svgTags";

export type SvgControlKind = "line-start" | "line-end" | "point" | "center";

export type MoveableSupport = {
  resizable: boolean;
  scalable: boolean;
  controls: readonly SvgControlKind[];
};

const none = { resizable: false, scalable: false, controls: [] } as const;
const scalable = { resizable: false, scalable: true, controls: [] } as const;
const resizable = { resizable: true, scalable: false, controls: [] } as const;

export const svgMoveableSupport: Record<SvgTag, MoveableSupport> = {
  svg: none,
  g: scalable,
  defs: none,
  symbol: scalable,
  use: scalable,
  rect: resizable,
  circle: { resizable: true, scalable: false, controls: ["center"] },
  ellipse: { resizable: true, scalable: false, controls: ["center"] },
  line: { resizable: false, scalable: false, controls: ["line-start", "line-end"] },
  polyline: { resizable: false, scalable: false, controls: ["point"] },
  polygon: { resizable: false, scalable: false, controls: ["point"] },
  path: scalable,
  text: scalable,
  tspan: scalable,
  textPath: scalable,
  title: none,
  desc: none,
  clipPath: none,
  mask: none,
  pattern: none,
  linearGradient: none,
  radialGradient: none,
  stop: none,
  filter: none,
  feBlend: none,
  feColorMatrix: none,
  feComponentTransfer: none,
  feComposite: none,
  feConvolveMatrix: none,
  feDiffuseLighting: none,
  feDisplacementMap: none,
  feDropShadow: none,
  feFlood: none,
  feGaussianBlur: none,
  feImage: none,
  feMerge: none,
  feMergeNode: none,
  feMorphology: none,
  feOffset: none,
  feSpecularLighting: none,
  feTile: none,
  feTurbulence: none,
  marker: none,
  foreignObject: resizable,
};

export function moveableSupportForElement(element: ElementRecord): MoveableSupport {
  if (element.kind !== "svg" || !element.tag) {
    return { resizable: true, scalable: false, controls: [] };
  }
  return (
    svgMoveableSupport[element.tag as SvgTag] ?? { resizable: false, scalable: true, controls: [] }
  );
}

function shiftNumeric(value: AttributeValue | undefined, delta: number) {
  if (value === undefined || value === null) return String(delta);
  if (typeof value === "number") return String(value + delta);
  if (typeof value !== "string") return null;
  if (!/^[-+]?\d*\.?\d+(?:px)?$/.test(value.trim())) return null;
  const hasPx = value.trim().endsWith("px");
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number)) return null;
  return `${number + delta}${hasPx ? "px" : ""}`;
}

function shiftPoints(value: AttributeValue | undefined, dx: number, dy: number) {
  if (typeof value !== "string") return null;
  const tokens = value
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  if (tokens.length < 2 || tokens.length % 2 !== 0) return null;

  const shifted: string[] = [];
  for (let i = 0; i < tokens.length; i += 2) {
    const x = Number.parseFloat(tokens[i]);
    const y = Number.parseFloat(tokens[i + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    shifted.push(`${x + dx},${y + dy}`);
  }
  return shifted.join(" ");
}

export function svgDragAttributes(element: ElementRecord, dx: number, dy: number) {
  const tag = element.tag as SvgTag;
  if (!tag) return null;

  const attributes: ElementAttributes = { ...element.attributes };

  const set = (name: string, delta: number) => {
    const next = shiftNumeric(attributes[name], delta);
    if (next === null) return false;
    attributes[name] = next;
    return true;
  };

  switch (tag) {
    case "rect":
    case "foreignObject":
    case "use":
    case "pattern":
      if (!set("x", dx) || !set("y", dy)) return null;
      break;
    case "circle":
    case "ellipse":
      if (!set("cx", dx) || !set("cy", dy)) return null;
      break;
    case "text":
    case "tspan":
      if (!set("x", dx) || !set("y", dy)) return null;
      break;
    case "line":
      if (!set("x1", dx) || !set("y1", dy) || !set("x2", dx) || !set("y2", dy)) {
        return null;
      }
      break;
    case "polyline":
    case "polygon": {
      const points = shiftPoints(attributes.points, dx, dy);
      if (!points) return null;
      attributes.points = points;
      break;
    }
    default:
      return null;
  }

  return attributes;
}

export function svgScaleAttributes(
  element: ElementRecord,
  startWidth: number,
  startHeight: number,
  scaleX: number,
  scaleY: number,
) {
  const attributes: ElementAttributes = { ...element.attributes };
  const sx = Math.abs(scaleX);
  const sy = Math.abs(scaleY);

  switch (element.tag) {
    case "rect":
    case "foreignObject":
      attributes.width = String(startWidth * sx);
      attributes.height = String(startHeight * sy);
      return attributes;
    case "ellipse":
      attributes.rx = String((startWidth / 2) * sx);
      attributes.ry = String((startHeight / 2) * sy);
      return attributes;
    case "circle":
      attributes.r = String((startWidth / 2) * Math.min(sx, sy));
      return attributes;
    default:
      return null;
  }
}
