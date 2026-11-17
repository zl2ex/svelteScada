import { describe, expect, it } from "vitest";
import { nudgeSortIndices } from "./elementNudge";

function elements(ids: string[]) {
  return Object.fromEntries(
    ids.map((id, sortIndex) => [id, { id, parentId: null, sortIndex }]),
  );
}

describe("nudgeSortIndices", () => {
  it("moves a single sibling one slot", () => {
    const tree = elements(["a", "b", "c"]);

    expect(nudgeSortIndices(tree, ["b"], "previous")).toEqual({ b: 0, a: 1 });
    expect(nudgeSortIndices(tree, ["b"], "next")).toEqual({ c: 1, b: 2 });
  });

  it("moves a contiguous block as a group", () => {
    const tree = elements(["a", "b", "c", "d"]);

    expect(nudgeSortIndices(tree, ["b", "c"], "previous")).toEqual({
      b: 0,
      c: 1,
      a: 2,
    });
    expect(nudgeSortIndices(tree, ["b", "c"], "next")).toEqual({
      d: 1,
      b: 2,
      c: 3,
    });
  });

  it("does nothing at the boundaries", () => {
    const tree = elements(["a", "b", "c"]);

    expect(nudgeSortIndices(tree, ["a"], "previous")).toEqual({});
    expect(nudgeSortIndices(tree, ["c"], "next")).toEqual({});
  });

  it("moves multiple selected runs", () => {
    const tree = elements(["a", "b", "c", "d"]);

    expect(nudgeSortIndices(tree, ["a", "c"], "next")).toEqual({
      b: 0,
      a: 1,
      d: 2,
      c: 3,
    });
  });
});
