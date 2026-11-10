import { describe, expect, it } from "vitest";
import type { ElementRecord } from "$lib/elements/elementTypes";
import type { SvgTag } from "$lib/elements/svgTags";
import {
  applySvgGeometryControlDrag,
  getSvgGeometryControls,
  supportsSvgGeometryControls,
} from "./svgGeometryControls";

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

describe("svgGeometryControls", () => {
  it("supports point controls and center controls", () => {
    for (const tag of ["line", "polyline", "polygon", "circle", "ellipse"] as SvgTag[]) {
      expect(supportsSvgGeometryControls(element(tag))).toBe(true);
    }
    for (const tag of ["rect", "path", "svg"] as SvgTag[]) {
      expect(supportsSvgGeometryControls(element(tag))).toBe(false);
    }
  });

  it("updates line endpoints", () => {
    const line = element("line", { x1: "0", y1: "0", x2: "10", y2: "10" });
    const controls = getSvgGeometryControls(line);
    expect(applySvgGeometryControlDrag(line, line.attributes, controls[0], { x: 4, y: 6 })).toEqual(
      {
        x1: "4",
        y1: "6",
        x2: "10",
        y2: "10",
      },
    );
    expect(
      applySvgGeometryControlDrag(line, line.attributes, controls[1], { x: 20, y: 30 }),
    ).toEqual({ x1: "0", y1: "0", x2: "20", y2: "30" });
  });

  it("updates a single polygon point", () => {
    const polygon = element("polygon", { points: "0,0 10,0 10,10" });
    const control = getSvgGeometryControls(polygon)[1];
    expect(
      applySvgGeometryControlDrag(polygon, polygon.attributes, control, { x: 15, y: 5 }),
    ).toEqual({ points: "0,0 15,5 10,10" });
  });

  it("moves circle and ellipse centers without changing radii", () => {
    const circle = element("circle", { cx: "50", cy: "50", r: "10" });
    const circleCenter = getSvgGeometryControls(circle)[0];
    expect(circleCenter).toMatchObject({ kind: "center", key: "circle:center", x: 50, y: 50 });
    expect(
      applySvgGeometryControlDrag(circle, circle.attributes, circleCenter, { x: 70, y: 80 }),
    ).toEqual({ cx: "70", cy: "80", r: "10" });

    const ellipse = element("ellipse", { cx: "50", cy: "50", rx: "20", ry: "10" });
    const ellipseCenter = getSvgGeometryControls(ellipse)[0];
    expect(ellipseCenter).toMatchObject({ kind: "center", key: "ellipse:center", x: 50, y: 50 });
    expect(
      applySvgGeometryControlDrag(ellipse, ellipse.attributes, ellipseCenter, { x: 20, y: 30 }),
    ).toEqual({ cx: "20", cy: "30", rx: "20", ry: "10" });
  });

  it("does not mutate base attributes", () => {
    const line = element("line", { x1: "0", y1: "0", x2: "10", y2: "10" });
    const base = { ...line.attributes };
    applySvgGeometryControlDrag(line, base, getSvgGeometryControls(line)[0], { x: 5, y: 5 });
    expect(line.attributes).toEqual(base);
    expect(base).toEqual({ x1: "0", y1: "0", x2: "10", y2: "10" });
  });
});
