import { describe, expect, it } from "vitest";
import type { ElementRecord } from "$lib/elements/elementTypes";
import {
  appearanceFieldsFor,
  appearanceManagedStyleKeys,
  appearanceOptions,
  appearanceSuggestions,
  toHexColor,
} from "./elementAppearance";

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
    attributes: {},
    properties: {},
    style: {},
    styleClass: [],
    bindings: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("elementAppearance", () => {
  it("shows common and HTML fields for HTML elements", () => {
    const properties = appearanceFieldsFor([element()]).map((field) => field.property);

    expect(properties).toEqual(
      expect.arrayContaining([
        "visibility",
        "opacity",
        "color",
        "background-color",
        "border-style",
      ]),
    );
    expect(properties).not.toContain("stroke");
  });

  it("shows common and SVG fields for SVG elements", () => {
    const properties = appearanceFieldsFor([element({ kind: "svg", tag: "rect" })]).map(
      (field) => field.property,
    );

    expect(properties).toEqual(
      expect.arrayContaining([
        "visibility",
        "opacity",
        "stroke",
        "fill",
        "stroke-width",
        "stroke-dasharray",
        "stroke-linecap",
      ]),
    );
    expect(properties).not.toContain("background-color");
  });

  it("shows only common fields for mixed SVG and HTML selections", () => {
    const properties = appearanceFieldsFor([
      element({ id: "html" }),
      element({ id: "svg", kind: "svg", tag: "rect" }),
    ]).map((field) => field.property);

    expect(properties).toEqual(["visibility", "opacity"]);
  });

  it("does not expose appearance for user components", () => {
    expect(appearanceFieldsFor([element({ kind: "user-component", tag: null })])).toEqual([]);
  });

  it("tracks managed style keys and injects custom select options", () => {
    expect(appearanceManagedStyleKeys([element()])).toEqual(
      new Set([
        "visibility",
        "opacity",
        "color",
        "background-color",
        "border-radius",
        "border-style",
        "border-color",
      ]),
    );

    const field = appearanceFieldsFor([element()]).find(
      (candidate) => candidate.property === "visibility",
    );
    expect(field).toBeDefined();
    if (!field) return;

    expect(appearanceOptions(field, "visible")).toContainEqual({
      label: "Custom (visible)",
      value: "visible",
    });
  });

  it("suggests theme variables and normalizes hex colors", () => {
    const field = appearanceFieldsFor([element()]).find(
      (candidate) => candidate.property === "color",
    );
    expect(field).toBeDefined();
    if (!field) return;

    expect(appearanceSuggestions(field, "--color-primary-500: red;")).toContain(
      "var(--color-primary-500)",
    );
    expect(toHexColor("#abc")).toBe("#aabbcc");
    expect(toHexColor("var(--color-primary-500)")).toBe("#000000");
  });
});
