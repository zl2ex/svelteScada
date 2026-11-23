import { describe, expect, it } from "vitest";
import {
  CANVAS_ZOOM_STEP,
  MAX_CANVAS_ZOOM,
  MIN_CANVAS_ZOOM,
  clampCanvasZoom,
  stepCanvasZoom,
} from "./canvasZoom";

describe("canvasZoom", () => {
  it("clamps zoom to the supported range", () => {
    expect(clampCanvasZoom(0.1)).toBe(MIN_CANVAS_ZOOM);
    expect(clampCanvasZoom(20)).toBe(MAX_CANVAS_ZOOM);
    expect(clampCanvasZoom(1.234)).toBe(1.23);
  });

  it("steps zoom in and out logarithmically", () => {
    const step = CANVAS_ZOOM_STEP * Math.log10(2);
    expect(stepCanvasZoom(1, 1)).toBeCloseTo(1 + step);
    expect(stepCanvasZoom(1, -1)).toBeCloseTo(1 - step);
    expect(stepCanvasZoom(MAX_CANVAS_ZOOM, 1)).toBe(MAX_CANVAS_ZOOM);
    expect(stepCanvasZoom(MIN_CANVAS_ZOOM, -1)).toBe(MIN_CANVAS_ZOOM);
  });
});
