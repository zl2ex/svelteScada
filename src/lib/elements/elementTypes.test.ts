import { describe, expect, it } from "vitest";
import type { ElementRecord } from "./elementTypes";
import {
  elementContainerTypeError,
  elementParentError,
  findContainerInsertionTarget,
  isContainerElement,
  isSvgContainer,
} from "./elementTypes";

function shape(
  kind: ElementRecord["kind"],
  tag: string | null,
): Pick<ElementRecord, "kind" | "tag"> {
  return { kind, tag };
}

function record(
  id: string,
  parentId: string | null,
  kind: ElementRecord["kind"],
  tag: string | null,
): ElementRecord {
  return {
    id,
    parentId,
    kind,
    tag,
    sortIndex: 0,
    baseComponent: null,
    referencedComponentId: null,
    name: tag ?? kind,
    text: null,
    containerType: "none",
    attributes: {},
    style: {},
    styleClass: [],
    bindings: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("SVG group containers", () => {
  it("treats g as an SVG and element container", () => {
    const group = shape("svg", "g");
    expect(isSvgContainer(group)).toBe(true);
    expect(isContainerElement(group)).toBe(true);
  });

  it("allows svg drawing elements inside g", () => {
    expect(elementParentError(shape("svg", "rect"), shape("svg", "g"))).toBeNull();
    expect(elementParentError(shape("svg", "circle"), shape("svg", "g"))).toBeNull();
  });

  it("allows groups inside svg and groups", () => {
    expect(elementParentError(shape("svg", "g"), shape("svg", "svg"))).toBeNull();
    expect(elementParentError(shape("svg", "g"), shape("svg", "g"))).toBeNull();
  });

  it("rejects non-SVG children inside g", () => {
    expect(elementParentError(shape("html", "div"), shape("svg", "g"))).toContain(
      "only contain SVG",
    );
  });

  it("rejects a root-level g", () => {
    expect(elementParentError(shape("svg", "g"), null)).toContain("inside an <svg> or <g>");
  });

  it("allows g to use a container type", () => {
    const group = { ...shape("svg", "g"), containerType: "flex" as const };
    expect(elementContainerTypeError(group)).toBeNull();
  });

  it("selects a g as the insertion target", () => {
    const elements = {
      svg: record("svg", null, "svg", "svg"),
      group: record("group", "svg", "svg", "g"),
      rect: record("rect", "group", "svg", "rect"),
    };

    expect(findContainerInsertionTarget(elements, "group")).toBe("group");
    expect(findContainerInsertionTarget(elements, "rect")).toBe("group");
  });
});
