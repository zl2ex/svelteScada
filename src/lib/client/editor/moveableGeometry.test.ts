import { describe, expect, it } from "vitest";
import type { ElementRecord } from "$lib/elements/elementTypes";
import {
  applyDrag,
  applyResize,
  applyRotate,
  captureBoxChanges,
  formatLength,
  parseLength,
  readBox,
  readUnits,
  unitOf,
  type MoveableElement,
} from "./moveableGeometry";

const element = {} as MoveableElement;

function record(overrides: Partial<ElementRecord> = {}): ElementRecord {
  return {
    id: "element",
    parentId: null,
    sortIndex: 0,
    kind: "html",
    tag: "div",
    baseComponent: null,
    referencedComponentId: null,
    name: "element",
    text: null,
    containerType: "none",
    attributes: {},
    style: {},
    styleClass: [],
    bindings: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as ElementRecord;
}

describe("moveableGeometry units", () => {
  it("reads authored units with fallbacks", () => {
    expect(unitOf("50%", "")).toBe("%");
    expect(unitOf("12px", "")).toBe("px");
    expect(unitOf("auto", "px")).toBe("px");
    expect(unitOf("", "px")).toBe("px");
  });

  it("formats and parses unitless and pixel lengths", () => {
    expect(formatLength(12.34567, "", "x", element)).toBe("12.3457");
    expect(formatLength(12, "px", "y", element)).toBe("12px");
    expect(parseLength("12px", "x", element)).toBe(12);
    expect(parseLength(12, "y", element)).toBe(12);
  });
});

describe("moveableGeometry boxes", () => {
  it("reads HTML boxes from element style", () => {
    const html = record({
      style: {
        left: "10px",
        top: "20px",
        width: "100px",
        height: "50px",
        rotate: "15deg",
        "transform-origin": "25% 75%",
      },
    });

    expect(readBox(html, element)).toEqual({
      x: 10,
      y: 20,
      w: 100,
      h: 50,
      rotate: 15,
      ox: 25,
      oy: 37.5,
    });
    expect(readUnits(html)).toEqual({
      x: "px",
      y: "px",
      w: "px",
      h: "px",
      ox: "%",
      oy: "%",
    });
  });

  it("reads SVG rect boxes from attributes and style", () => {
    const rect = record({
      kind: "svg",
      tag: "rect",
      attributes: { x: "10", y: "20" },
      style: { width: "100px", height: "50px" },
    });

    expect(readBox(rect, element)).toMatchObject({ x: 10, y: 20, w: 100, h: 50 });
    expect(readUnits(rect)).toMatchObject({ x: "", y: "" });
  });

  it("reads SVG center boxes from cx/cy and radii", () => {
    const circle = record({
      kind: "svg",
      tag: "circle",
      attributes: { cx: "50", cy: "60", r: "10" },
    });

    expect(readBox(circle, element)).toMatchObject({ x: 40, y: 50, w: 20, h: 20 });
    expect(readUnits(circle)).toMatchObject({ x: "", y: "" });
  });
});

describe("moveableGeometry changes", () => {
  it("captures HTML drag changes from start and current boxes", () => {
    const html = record({
      style: { position: "absolute", left: "10px", top: "20px" },
    });
    const start = readBox(html, element);
    const current = applyDrag(start, [5, 7], element);

    expect(captureBoxChanges(html, start, current, readUnits(html), element)).toEqual({
      style: { left: "15px", top: "27px" },
    });
  });

  it("uses cumulative drag distance from the start box", () => {
    const html = record({ style: { position: "absolute", left: "10px", top: "20px" } });
    const start = readBox(html, element);
    const first = applyDrag(start, [5, 7], element);
    const second = applyDrag(start, [12, 18], element);

    expect(first).toMatchObject({ x: 15, y: 27 });
    expect(second).toMatchObject({ x: 22, y: 38 });
  });

  it("converts screen drag and resize deltas through canvas zoom", () => {
    const html = record({
      style: { position: "absolute", left: "10px", top: "20px", width: "100px", height: "50px" },
    });
    const start = readBox(html, element);
    const dragged = applyDrag(start, [10, 20], element, 2);
    const resized = applyResize(start, 110, 60, [10, 20], element, 2);

    expect(dragged).toMatchObject({ x: 15, y: 30 });
    expect(resized).toMatchObject({ x: 15, y: 30, w: 110, h: 60 });
  });

  it("captures SVG attribute position changes", () => {
    const rect = record({
      kind: "svg",
      tag: "rect",
      attributes: { x: "10", y: "20" },
      style: { width: "100px", height: "50px" },
    });
    const start = readBox(rect, element);
    const current = applyDrag(start, [5, 7], element);

    expect(captureBoxChanges(rect, start, current, readUnits(rect), element)).toEqual({
      attributes: { x: "15", y: "27" },
    });
  });

  it("captures rotation changes", () => {
    const html = record({ style: { rotate: "10deg" } });
    const start = readBox(html, element);
    const current = applyRotate(start, 35);

    expect(captureBoxChanges(html, start, current, readUnits(html), element)).toEqual({
      style: { rotate: "35deg" },
    });
  });

  it("shifts line endpoints and clears legacy translate", () => {
    const line = record({
      kind: "svg",
      tag: "line",
      attributes: { x1: "0", y1: "10", x2: "20", y2: "30" },
      style: { translate: "10px 20px" },
    });
    const start = readBox(line, element);
    const current = applyDrag(start, [5, 7], element);

    expect(captureBoxChanges(line, start, current, readUnits(line), element)).toEqual({
      attributes: { x1: "5", y1: "17", x2: "25", y2: "37" },
      style: { translate: "" },
    });
  });

  it("shifts polyline and polygon points", () => {
    for (const tag of ["polyline", "polygon"] as const) {
      const shape = record({
        kind: "svg",
        tag,
        attributes: { points: "0,0 10,0 10,10" },
      });
      const start = readBox(shape, element);
      const current = applyDrag(start, [2, 3], element);

      expect(captureBoxChanges(shape, start, current, readUnits(shape), element)).toEqual({
        attributes: { points: "2,3 12,3 12,13" },
      });
    }
  });

  it("writes transform-origin as an element-relative fill-box value", () => {
    const rect = record({
      kind: "svg",
      tag: "rect",
      attributes: { x: "10", y: "20" },
      style: {
        width: "100px",
        height: "50px",
        "transform-box": "fill-box",
        "transform-origin": "25% 25%",
      },
    });
    const start = readBox(rect, element);
    const current = { ...start, ox: 50, oy: 25 };

    expect(captureBoxChanges(rect, start, current, readUnits(rect), element)).toEqual({
      style: { "transform-origin": "50% 50%" },
    });
  });

  it("returns no changes when the box has not moved", () => {
    const html = record({ style: { left: "10px", top: "20px" } });
    const start = readBox(html, element);

    expect(captureBoxChanges(html, start, { ...start }, readUnits(html), element)).toBeNull();
  });
});
