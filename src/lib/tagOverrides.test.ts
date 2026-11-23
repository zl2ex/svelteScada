import { describe, expect, it } from "vitest";
import type { TagOptionsInput } from "$lib/server/tag/tag";
import { applyUdtOverrides } from "./tagOverrides";

function tag(overrides: Partial<TagOptionsInput> = {}): TagOptionsInput {
  return {
    id: "tag-1",
    folderId: null,
    name: "Tag",
    dataType: "Double",
    initalValue: null,
    driverPath: null,
    readonly: false,
    exposeOverOpcua: true,
    properties: { prefix: { value: "motor", required: true } },
    unit: "",
    bindings: null,
    writeLevel: "operator",
    trendEnabled: false,
    trendMinimumSamplingIntervalMs: 1000,
    ...overrides,
  };
}

describe("applyUdtOverrides", () => {
  it("applies top-level overrides without mutating the base tag", () => {
    const base = tag({
      udtOverrides: { unit: "V", readonly: true },
    });

    const effective = applyUdtOverrides(base);

    expect(effective.unit).toBe("V");
    expect(effective.readonly).toBe(true);
    expect(base.unit).toBe("");
    expect(base.readonly).toBe(false);
  });

  it("merges property overrides", () => {
    const base = tag({
      udtOverrides: {
        properties: {
          prefix: { value: "instance", required: true },
        },
      },
    });

    expect(applyUdtOverrides(base).properties).toEqual({
      prefix: { value: "instance", required: true },
    });
  });

  it("merges binding overrides", () => {
    const base = tag({
      bindings: { driverPath: '"base"', unit: '"V"' },
      udtOverrides: { bindings: { unit: '"A"' } },
    });

    expect(applyUdtOverrides(base).bindings).toEqual({
      driverPath: '"base"',
      unit: '"A"',
    });
  });

  it("returns the base tag when there are no overrides", () => {
    const base = tag();
    expect(applyUdtOverrides(base)).toBe(base);
  });
});
