import { describe, expect, it } from "vitest";
import type { TagValueMap } from "$lib/client/live/tagMap.svelte";
import type { ElementRecord } from "$lib/elements/elementTypes";
import {
  buildAttributeRows,
  buildStyleRows,
  commonKeysFor,
  commonStrings,
  updateElements,
} from "./elementSelectionRows";

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
    attributes: { id: "box" },
    properties: {},
    style: { color: "red" },
    styleClass: [],
    bindings: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

const tagValueMap = {
  tag: () => undefined,
  tagValue: () => undefined,
  tagStatus: () => "missing",
} as unknown as TagValueMap;

describe("elementSelectionRows", () => {
  it("finds common keys for single and multiple elements", () => {
    expect(commonKeysFor([{ color: "red", width: "1px" }])).toEqual(["color", "width"]);
    expect(commonKeysFor([{ color: "red", width: "1px" }, { color: "blue" }])).toEqual(["color"]);
  });

  it("reports mixed strings and values", () => {
    expect(commonStrings(["a", "a"])).toEqual({ value: "a", mixed: false });
    expect(commonStrings(["a", "b"])).toEqual({ value: "", mixed: true });
  });

  it("builds style rows for one element", () => {
    const rows = buildStyleRows([element()], tagValueMap);

    expect(rows).toEqual([
      {
        key: "color",
        value: "red",
        binding: "",
        result: "",
        error: null,
        placeholder: undefined,
      },
    ]);
  });

  it("only returns common style keys for multiple elements", () => {
    const rows = buildStyleRows(
      [
        element({ id: "a", style: { color: "red", width: "1px" } }),
        element({ id: "b", style: { color: "blue" } }),
      ],
      tagValueMap,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: "color", value: "", placeholder: "<multiple_values>" });
  });

  it("builds attribute rows and flags mixed values", () => {
    const rows = buildAttributeRows(
      [element({ id: "a" }), element({ id: "b", attributes: { id: "other" } })],
      "attributes",
      tagValueMap,
    );

    expect(rows[0]).toMatchObject({ key: "id", value: "", placeholder: "<multiple_values>" });
  });

  it("updates every selected element in one call", () => {
    const updates: Array<{ id: string; changes: Partial<Omit<ElementRecord, "id">> }> = [];
    updateElements(
      { updateMany: (items) => updates.push(...items) },
      [element({ id: "a" }), element({ id: "b" })],
      () => ({ style: { color: "blue" } }),
    );

    expect(updates.map((update) => update.id)).toEqual(["a", "b"]);
    expect(updates.every((update) => update.changes.style?.color === "blue")).toBe(true);
    expect(updates.every((update) => typeof update.changes.updatedAt === "number")).toBe(true);
  });
});
