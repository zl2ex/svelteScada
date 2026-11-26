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
  "stroke-linecap": "round",
};

const textStyle = {
  fill: "var(--color-surface-600-400)",
  "font-family": "sans-serif",
  "font-size": "16px",
};

const centerOrigin = {
  "transform-box": "fill-box",
  "transform-origin": "center",
};

const defaultPosition = {
  x: "50px",
  y: "50px",
};

export const svgElementDefaults = {
  svg: {
    attributes: {
      ...defaultPosition,
      viewBox: "0 0 1000 1000",
    },
  },
  g: {},
  defs: {},
  symbol: {
    attributes: { viewBox: "0 0 100 100" },
  },
  use: {},
  rect: {
    style: {
      ...filledShapeStyle,

      ...centerOrigin,
    },
    attributes: {
      ...defaultPosition,
      width: "50px",
      height: "50px",
    },
  },
  circle: {
    style: {
      ...filledShapeStyle,
      ...centerOrigin,
    },
    attributes: {
      cx: defaultPosition.x,
      cy: defaultPosition.y,
      r: "40px",
    },
  },
  ellipse: {
    style: {
      ...filledShapeStyle,
      ...centerOrigin,
    },
    attributes: {
      cx: defaultPosition.x,
      cy: defaultPosition.y,
      rx: "50px",
      ry: "30px",
    },
  },
  line: {
    attributes: { x1: defaultPosition.x, y1: defaultPosition.y, x2: "60px", y2: "60px" },
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
    attributes: {
      ...defaultPosition,
      "text-anchor": "center",
    },
    style: { ...textStyle },
  },
  tspan: {
    attributes: {
      ...defaultPosition,
    },
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
    attributes: { width: "10px", height: "10px", patternUnits: "userSpaceOnUse" },
  },
  linearGradient: {
    attributes: { x1: "0px", y1: "0px", x2: "100px", y2: "0px" },
  },
  radialGradient: {
    attributes: { cx: "50px", cy: "50px", r: "50px" },
  },
  stop: {
    attributes: { offset: "0px" },
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
    attributes: { dx: "0px", dy: "0px", in: "SourceGraphic" },
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
      markerWidth: "6px",
      markerHeight: "6px",
      refX: "3px",
      refY: "3px",
      orient: "auto",
    },
  },
  foreignObject: {},
} satisfies Record<SvgTag, ElementDefaultsInput>;
