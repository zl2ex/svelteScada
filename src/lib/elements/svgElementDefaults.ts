import type { ElementDefaultsInput } from "./defaults";
import type { SvgTag } from "./svgTags";

const filledShapeStyle = {
  fill: "var(--color-surface-600-400)",
  stroke: "none",
};

const strokedShapeStyle = {
  fill: "none",
  stroke: "var(--color-surface-600-400)",
  "stroke-width": "2",
};

const textStyle = {
  fill: "var(--color-surface-600-400)",
  "font-family": "sans-serif",
  "font-size": "16px",
};

const defaultPosition = {
  x: "50%",
  y: "50%",
};

export const svgElementDefaults = {
  svg: {},
  g: {},
  defs: {},
  symbol: {
    attributes: { viewBox: "0 0 100 100" },
  },
  use: {},
  rect: {
    style: {
      ...filledShapeStyle,
      x: defaultPosition.x,
      y: defaultPosition.y,
      width: "100px",
      height: "60px",
    },
  },
  circle: {
    style: {
      ...filledShapeStyle,
      cx: defaultPosition.x,
      cy: defaultPosition.y,
      r: "40px",
    },
  },
  ellipse: {
    style: {
      ...filledShapeStyle,
      cx: defaultPosition.x,
      cy: defaultPosition.y,
      rx: "50px",
      ry: "30px",
    },
  },
  line: {
    attributes: { x1: defaultPosition.x, y1: defaultPosition.y, x2: "60%", y2: "60%" },
    style: { ...strokedShapeStyle },
  },
  polyline: {
    attributes: { points: "0,50 25,0 50,50 75,0 100,50" },
    style: { ...strokedShapeStyle },
  },
  polygon: {
    attributes: { points: "50,0 100,100 0,100" },
    style: { ...filledShapeStyle },
  },
  path: {
    attributes: { d: "M10 80 L50 10 L90 80 Z" },
    style: { ...filledShapeStyle },
  },
  text: {
    style: { ...textStyle },
  },
  tspan: {
    style: { ...textStyle },
  },
  textPath: {
    style: { ...textStyle },
  },
  title: {},
  desc: {},
  clipPath: {},
  mask: {},
  pattern: {
    attributes: { width: "10", height: "10", patternUnits: "userSpaceOnUse" },
  },
  linearGradient: {
    attributes: { x1: "0%", y1: "0%", x2: "100%", y2: "0%" },
  },
  radialGradient: {
    attributes: { cx: "50%", cy: "50%", r: "50%" },
  },
  stop: {
    attributes: { offset: "0%" },
    style: { "stop-color": "var(--color-surface-600-400)" },
  },
  filter: {},
  feBlend: {
    attributes: { mode: "normal", in: "SourceGraphic", in2: "SourceGraphic" },
  },
  feColorMatrix: {
    attributes: {
      type: "matrix",
      values: "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0",
    },
  },
  feComponentTransfer: {},
  feComposite: {
    attributes: { operator: "over", in: "SourceGraphic", in2: "SourceGraphic" },
  },
  feConvolveMatrix: {
    attributes: {
      order: "3",
      kernelMatrix: "0 0 0 0 1 0 0 0 0",
      divisor: "1",
      preserveAlpha: "true",
    },
  },
  feDiffuseLighting: {
    attributes: {
      surfaceScale: "1",
      diffuseConstant: "1",
      "lighting-color": "white",
    },
  },
  feDisplacementMap: {
    attributes: {
      scale: "1",
      xChannelSelector: "A",
      yChannelSelector: "A",
      in: "SourceGraphic",
      in2: "SourceGraphic",
    },
  },
  feDropShadow: {
    attributes: {
      dx: "2",
      dy: "2",
      stdDeviation: "2",
      "flood-color": "var(--color-surface-600-400)",
    },
  },
  feFlood: {
    attributes: { "flood-color": "var(--color-surface-600-400)", "flood-opacity": "1" },
  },
  feGaussianBlur: {
    attributes: { stdDeviation: "2" },
  },
  feImage: {},
  feMerge: {},
  feMergeNode: {
    attributes: { in: "SourceGraphic" },
  },
  feMorphology: {
    attributes: { operator: "erode", radius: "1" },
  },
  feOffset: {
    attributes: { dx: "0", dy: "0", in: "SourceGraphic" },
  },
  feSpecularLighting: {
    attributes: {
      surfaceScale: "1",
      specularConstant: "1",
      specularExponent: "20",
      "lighting-color": "white",
    },
  },
  feTile: {
    attributes: { in: "SourceGraphic" },
  },
  feTurbulence: {
    attributes: {
      type: "fractalNoise",
      baseFrequency: "0.05",
      numOctaves: "2",
    },
  },
  marker: {
    attributes: {
      markerWidth: "6",
      markerHeight: "6",
      refX: "3",
      refY: "3",
      orient: "auto",
    },
  },
  foreignObject: {
    style: { width: "160px", height: "90px" },
  },
} satisfies Record<SvgTag, ElementDefaultsInput>;
