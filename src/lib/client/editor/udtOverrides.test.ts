import { describe, expect, it } from "vitest";
import type { TagOptionsInput } from "$lib/server/tag/tag";
import type { UdtDefinitionInput, UdtDefinitionTagInput } from "$lib/sqlite/tables/udt_definitions";
import { buildUdtOverrides, inheritedTagFieldValue } from "./udtOverrides";

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
    properties: null,
    unit: "",
    bindings: null,
    writeLevel: "operator",
    trendEnabled: false,
    trendMinimumSamplingIntervalMs: 1000,
    ...overrides,
  };
}

function child(overrides: Partial<UdtDefinitionTagInput> = {}): UdtDefinitionTagInput {
  return {
    id: "child-1",
    name: "Child",
    dataType: "Double",
    initalValue: null,
    driverPath: null,
    readonly: false,
    exposeOverOpcua: true,
    properties: null,
    unit: "",
    bindings: null,
    writeLevel: "operator",
    trendEnabled: false,
    trendMinimumSamplingIntervalMs: 1000,
    ...overrides,
  };
}

function definition(children: UdtDefinitionTagInput[] = []): UdtDefinitionInput {
  return {
    id: "def-1",
    name: "Motor",
    properties: { prefix: { value: "motor", required: true } },
    children,
  };
}

describe("buildUdtOverrides", () => {
  it("adds child field overrides that differ from the definition", () => {
    const definitionChild = child({ unit: "V", driverPath: "definition/path" });

    expect(
      buildUdtOverrides(
        tag({ udtDefinitionChildId: "child-1" }),
        { unit: "A" },
        definition([definitionChild]),
        definitionChild,
      ),
    ).toEqual({ unit: "A" });
  });

  it("removes child field overrides that match the definition again", () => {
    const definitionChild = child({ unit: "V" });

    expect(
      buildUdtOverrides(
        tag({ udtDefinitionChildId: "child-1", udtOverrides: { unit: "A" } }),
        { unit: "V" },
        definition([definitionChild]),
        definitionChild,
      ),
    ).toEqual({});
  });

  it("stores only differing property entries", () => {
    const def = definition();

    expect(
      buildUdtOverrides(
        tag(),
        {
          properties: {
            prefix: { value: "instance", required: true },
          },
        },
        def,
        undefined,
      ),
    ).toEqual({
      properties: {
        prefix: { value: "instance", required: true },
      },
    });
  });

  it("removes property overrides that match the definition again", () => {
    const def = definition();

    expect(
      buildUdtOverrides(
        tag({
          udtOverrides: {
            properties: { prefix: { value: "instance", required: true } },
          },
        }),
        {
          properties: {
            prefix: { value: "motor", required: true },
          },
        },
        def,
        undefined,
      ),
    ).toEqual({});
  });

  it("stores only changed binding keys", () => {
    const definitionChild = child({
      bindings: { driverPath: '"definition"', unit: '"V"' },
    });

    expect(
      buildUdtOverrides(
        tag({ udtDefinitionChildId: "child-1" }),
        { bindings: { driverPath: '"definition"', unit: '"A"' } },
        definition([definitionChild]),
        definitionChild,
      ),
    ).toEqual({ bindings: { unit: '"A"' } });
  });

  it("returns null for non-UDT tags", () => {
    expect(buildUdtOverrides(tag(), { unit: "A" }, undefined, undefined)).toBeNull();
  });
});

describe("inherited override fallbacks", () => {
  it("falls back to standard defaults for root top-level fields", () => {
    const root = tag({ dataType: "Motor" });
    const defs = { Motor: definition() };
    const tags = { [root.id]: root };

    expect(inheritedTagFieldValue(root, "unit", defs, tags)).toBe("");
    expect(inheritedTagFieldValue(root, "driverPath", defs, tags)).toBeNull();
    expect(inheritedTagFieldValue(root, "readonly", defs, tags)).toBe(false);
    expect(inheritedTagFieldValue(root, "writeLevel", defs, tags)).toBe("operator");
    expect(inheritedTagFieldValue(root, "dataType", defs, tags)).toBe("Motor");
  });

  it("falls back to child definition values", () => {
    const definitionChild = child({ unit: "V", readonly: null, driverPath: "definition/path" });
    const defs = { Motor: definition([definitionChild]) };
    const root = tag({ dataType: "Motor", readonly: true });
    const childTag = tag({
      id: "tag-1:child-1",
      parentTagId: "tag-1",
      udtDefinitionChildId: "child-1",
      dataType: "Double",
    });
    const tags = { [root.id]: root, [childTag.id]: childTag };

    expect(inheritedTagFieldValue(childTag, "unit", defs, tags)).toBe("V");
    expect(inheritedTagFieldValue(childTag, "driverPath", defs, tags)).toBe("definition/path");
    expect(inheritedTagFieldValue(childTag, "readonly", defs, tags)).toBe(true);
  });
});
