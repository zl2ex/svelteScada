import { describe, expect, it } from "vitest";
import { filterAutocompleteItems, findExactAutocompleteItem } from "./autocomplete";

describe("filterAutocompleteItems", () => {
  const items = ["card", "btn-primary", "btn-danger", "input", "InputGroup"];

  it("matches case-insensitively", () => {
    expect(filterAutocompleteItems(items, "INPUT")).toEqual(["input", "InputGroup"]);
  });

  it("returns the first items for an empty query", () => {
    expect(filterAutocompleteItems(items, "  ")).toEqual(items);
  });

  it("enforces the suggestion limit", () => {
    expect(filterAutocompleteItems(items, "", 2)).toEqual(["card", "btn-primary"]);
  });

  it("returns no results for an unmatched query", () => {
    expect(filterAutocompleteItems(items, "missing")).toEqual([]);
  });

  it("finds exact autocomplete matches", () => {
    expect(findExactAutocompleteItem(items, "input")).toBe("input");
    expect(findExactAutocompleteItem(items, "inp")).toBeNull();
    expect(findExactAutocompleteItem(items, "Input")).toBeNull();
  });
});
