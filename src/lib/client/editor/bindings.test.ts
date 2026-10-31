import { describe, expect, it } from "vitest";
import { updateBinding } from "$lib/client/editor/bindings";
import type { Bindings } from "$lib/bindings";
import type { TagBindings } from "$lib/tagBindings";

type TestBindings = Bindings<{
  text: string;
  attributes: Record<string, string>;
}>;

describe("generic binding helpers", () => {
  it("updates map bindings without mutating the original bindings", () => {
    const original: TestBindings = { attributes: { id: '"old"' } };
    const next = updateBinding(original, "attributes", "title", '"new"');

    expect(next).toEqual({ attributes: { id: '"old"', title: '"new"' } });
    expect(original).toEqual({ attributes: { id: '"old"' } });
  });

  it("supports scalar bindings for tags and collapses empty collections to null", () => {
    const original: TagBindings = { nodeId: '"ns=1;s=old"' };
    const withUnit = updateBinding(original, "unit", null, '"V"');

    expect(withUnit).toEqual({ nodeId: '"ns=1;s=old"', unit: '"V"' });
    expect(updateBinding(withUnit, "unit", null, "")).toEqual({
      nodeId: '"ns=1;s=old"',
    });
    expect(updateBinding(withUnit, "unit", null, "")).not.toBe(withUnit);
    expect(updateBinding({ unit: '"V"' } as TagBindings, "unit", null, "")).toBeNull();
  });
});
