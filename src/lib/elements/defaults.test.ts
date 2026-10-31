import { describe, expect, it } from "vitest";
import { baseComponentNames, baseComponents } from "./baseComponents";
import {
  getDefaultElementAttributes,
  getDefaultElementConfig,
  getDefaultElementStyle,
} from "./defaults";
import { htmlTags } from "./htmlTags";
import { svgTags } from "./svgTags";

describe("element insertion defaults", () => {
  it("provides defaults for every html tag without style/attribute collisions", () => {
    for (const tag of htmlTags) {
      const config = getDefaultElementConfig("html", { tag });

      expect(config.attributes).toBeTypeOf("object");
      expect(config.style).toBeTypeOf("object");
      expect(Object.keys(config.attributes).filter((key) => key in config.style)).toEqual([]);
    }
  });

  it("provides defaults for every svg tag without style/attribute collisions", () => {
    for (const tag of svgTags) {
      const config = getDefaultElementConfig("svg", { tag });

      expect(config.attributes).toBeTypeOf("object");
      expect(config.style).toBeTypeOf("object");
      expect(Object.keys(config.attributes).filter((key) => key in config.style)).toEqual([]);
    }
  });

  it("uses the existing base component defaults", () => {
    for (const name of baseComponentNames) {
      const config = getDefaultElementConfig("base-component", { baseComponent: name });

      expect(config.attributes).toEqual(baseComponents[name].defaultAttributes);
      expect(config.style).toEqual({});
    }
  });

  it("returns empty defaults for user components", () => {
    expect(getDefaultElementConfig("user-component", {})).toEqual({
      attributes: {},
      style: {},
    });
  });

  it("moves duplicate svg keys into style", () => {
    const attributes = getDefaultElementAttributes("svg", { tag: "rect" });
    const style = getDefaultElementStyle("svg", { tag: "rect" });

    expect(style.width).toBe("100px");
    expect(style.height).toBe("60px");
    expect(attributes).not.toHaveProperty("width");
    expect(attributes).not.toHaveProperty("height");
  });

  it("sets functional defaults for html controls", () => {
    expect(getDefaultElementAttributes("html", { tag: "input" })).toEqual({ type: "text" });
    expect(getDefaultElementAttributes("html", { tag: "button" })).toEqual({ type: "button" });
    expect(getDefaultElementAttributes("html", { tag: "details" })).toEqual({ open: true });
  });

  it("sets geometry and paint defaults for svg shapes", () => {
    expect(getDefaultElementStyle("svg", { tag: "circle" })).toMatchObject({
      cx: "50px",
      cy: "50px",
      r: "40px",
      fill: "var(--color-surface-600-400)",
      stroke: "none",
    });
    expect(getDefaultElementAttributes("svg", { tag: "line" })).toMatchObject({
      x1: "0",
      y1: "0",
      x2: "100",
      y2: "100",
    });
    expect(getDefaultElementAttributes("svg", { tag: "path" })).toHaveProperty("d");
  });
});
