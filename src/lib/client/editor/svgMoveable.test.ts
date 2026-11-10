import { describe, expect, it } from "vitest";
import type { ElementRecord } from "$lib/elements/elementTypes";
import type { SvgTag } from "$lib/elements/svgTags";
import {
  moveableSupportForElement,
  svgDragAttributes,
  svgScaleAttributes,
  svgMoveableSupport,
} from "./svgMoveable";

function element(tag: SvgTag, attributes: Record<string, string> = {}): ElementRecord {
  return {
    id: tag,
    parentId: null,
    sortIndex: 0,
    kind: "svg",
    tag,
    baseComponent: null,
    referencedComponentId: null,
    name: tag,
    text: null,
    containerType: "none",
    attributes,
    style: {},
    styleClass: [],
    bindings: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("svgMoveable helpers", () => {
  it("shifts rect x/y", () => {
    expect(svgDragAttributes(element("rect", { x: "10", y: "20" }), 5, -3)).toEqual({
      x: "15",
      y: "17",
    });
  });

  it("shifts circle cx/cy and defaults missing values", () => {
    expect(svgDragAttributes(element("circle", { cx: "10", cy: "20" }), 5, 7)).toEqual({
      cx: "15",
      cy: "27",
    });
    expect(svgDragAttributes(element("circle"), 5, 7)).toEqual({ cx: "5", cy: "7" });
  });

  it("shifts line endpoints", () => {
    expect(
      svgDragAttributes(element("line", { x1: "0", y1: "0", x2: "10", y2: "10" }), 4, 6),
    ).toEqual({ x1: "4", y1: "6", x2: "14", y2: "16" });
  });

  it("shifts polygon points", () => {
    expect(svgDragAttributes(element("polygon", { points: "0,0 10,0 10,10" }), 2, 3)).toEqual({
      points: "2,3 12,3 12,13",
    });
  });

  it("falls back for unsupported tags and non-numeric attributes", () => {
    expect(svgDragAttributes(element("path", { d: "M0 0 L10 10" }), 5, 5)).toBeNull();
    expect(svgDragAttributes(element("rect", { x: "50%", y: "0" }), 5, 5)).toBeNull();
    expect(svgDragAttributes(element("svg", { x: "0", y: "0" }), 5, 5)).toBeNull();
  });

  it("updates geometry for SVG scale where supported", () => {
    expect(
      svgScaleAttributes(element("rect", { width: "10", height: "20" }), 10, 20, 2, 3),
    ).toEqual({
      width: "20",
      height: "60",
    });
    expect(svgScaleAttributes(element("ellipse"), 10, 20, 2, 3)).toEqual({
      rx: "10",
      ry: "30",
    });
    expect(svgScaleAttributes(element("circle"), 10, 20, 2, 3)).toEqual({ r: "10" });
    expect(svgScaleAttributes(element("path"), 10, 20, 2, 3)).toBeNull();
  });
});

describe("svgMoveable support table", () => {
  it("marks text as scalable only", () => {
    expect(svgMoveableSupport.text).toEqual({
      resizable: false,
      scalable: true,
      controls: [],
    });
  });

  it("uses default controls for bounding-box primitives", () => {
    expect(svgMoveableSupport.rect).toEqual({
      resizable: true,
      scalable: false,
      controls: [],
    });
    expect(svgMoveableSupport.foreignObject).toEqual({
      resizable: true,
      scalable: false,
      controls: [],
    });
  });

  it("adds center controls to circle and ellipse", () => {
    expect(svgMoveableSupport.circle).toEqual({
      resizable: true,
      scalable: false,
      controls: ["center"],
    });
    expect(svgMoveableSupport.ellipse).toEqual({
      resizable: true,
      scalable: false,
      controls: ["center"],
    });
  });

  it("disables sizing for point-controlled primitives", () => {
    expect(svgMoveableSupport.line).toEqual({
      resizable: false,
      scalable: false,
      controls: ["line-start", "line-end"],
    });
    expect(svgMoveableSupport.polyline).toEqual({
      resizable: false,
      scalable: false,
      controls: ["point"],
    });
    expect(svgMoveableSupport.polygon).toEqual({
      resizable: false,
      scalable: false,
      controls: ["point"],
    });
  });

  it("disables moveable sizing for svg containers", () => {
    expect(svgMoveableSupport.svg).toEqual({
      resizable: false,
      scalable: false,
      controls: [],
    });
  });

  it("marks non-rendered definitions as unsupported", () => {
    expect(svgMoveableSupport.defs).toEqual({
      resizable: false,
      scalable: false,
      controls: [],
    });
    expect(svgMoveableSupport.linearGradient).toEqual({
      resizable: false,
      scalable: false,
      controls: [],
    });
  });

  it("never allows resizable and scalable together", () => {
    for (const support of Object.values(svgMoveableSupport)) {
      expect(support.resizable && support.scalable).toBe(false);
    }
  });

  it("treats HTML as resizable only", () => {
    expect(
      moveableSupportForElement({
        ...element("rect"),
        kind: "html",
        tag: "div",
      }),
    ).toEqual({ resizable: true, scalable: false, controls: [] });
  });
});
