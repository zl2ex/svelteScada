import { describe, expect, it } from "vitest";
import {
  parseElementWrite,
  validateElementAttributes,
  validateElementStyle,
} from "$lib/page/elementValidation";

function elementPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "element-1",
    parentId: null,
    sortIndex: 0,
    kind: "html",
    tag: "div",
    baseComponent: null,
    referencedComponentId: null,
    name: "div",
    text: null,
    containerType: "none",
    attributes: { id: "box" },
    style: { color: "red" },
    bindings: null,
    ...overrides,
  };
}

describe("element style validation", () => {
  it("parses style separately from attributes", () => {
    const result = parseElementWrite(elementPayload());

    expect(result.success).toBe(true);
    expect(result.success && result.data.attributes).toEqual({ id: "box" });
    expect(result.success && result.data.style).toEqual({ color: "red" });
  });

  it("rejects style objects inside attributes", () => {
    const result = parseElementWrite(
      elementPayload({ attributes: { id: "box", style: { color: "red" } } }),
    );

    expect(result.success).toBe(false);
  });

  it("rejects a style attribute name", () => {
    expect(validateElementAttributes({ style: "color:red" })).toContain("Style section");
  });

  it("accepts primitive attributes", () => {
    expect(validateElementAttributes({ id: "box", disabled: true, tabIndex: 1 })).toBeNull();
  });

  it("rejects unsafe style values", () => {
    expect(validateElementStyle({ background: "url(javascript:alert(1))" })).not.toBeNull();
    expect(validateElementStyle({ color: "red" })).toBeNull();
  });
});
