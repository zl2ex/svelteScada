import { describe, expect, it } from "vitest";
import {
  getStyle,
  getTopLevelAttributes,
  removeStyleRow,
  setStyleProperty,
} from "$lib/client/editor/elementBindingRows";
import type { ElementRecord } from "$lib/page/elementTypes";

function element(overrides: Partial<ElementRecord> = {}): ElementRecord {
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
    attributes: { id: "box", title: "Box" },
    style: { color: "red" },
    bindings: { style: { color: 'tagValue("color")?.value' } },
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("elementBindingRows style helpers", () => {
  it("returns top-level attributes without style", () => {
    expect(getTopLevelAttributes(element())).toEqual({ id: "box", title: "Box" });
  });

  it("returns a clone of the separate style object", () => {
    const source = element();
    const style = getStyle(source);
    style.color = "blue";

    expect(source.style).toEqual({ color: "red" });
  });

  it("updates style separately from attributes", () => {
    const source = element();
    const style = setStyleProperty(source, "width", "100%");

    expect(style).toEqual({ color: "red", width: "100%" });
    expect(source.style).toEqual({ color: "red" });
    expect(source.attributes).toEqual({ id: "box", title: "Box" });
  });

  it("removes style values without touching attributes", () => {
    const next = removeStyleRow(element(), "color");

    expect(next.style).toEqual({});
    expect(next.bindings).toBeNull();
    expect(next).not.toHaveProperty("attributes");
  });
});
