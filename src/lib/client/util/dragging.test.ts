import { describe, expect, it } from "vitest";
import { reorderIds } from "./dragging";

describe("reorderIds", () => {
  const ids = ["a", "b", "c", "d"];

  it("moves an item before a target", () => {
    expect(reorderIds(ids, "c", "a", "before")).toEqual(["c", "a", "b", "d"]);
    expect(reorderIds(ids, "d", "b", "before")).toEqual(["a", "d", "b", "c"]);
  });

  it("moves an item after a target", () => {
    expect(reorderIds(ids, "a", "c", "after")).toEqual(["b", "c", "a", "d"]);
  });

  it("moves an item to the end for inside drops", () => {
    expect(reorderIds(ids, "a", "d", "inside")).toEqual(["b", "c", "d", "a"]);
  });
});
