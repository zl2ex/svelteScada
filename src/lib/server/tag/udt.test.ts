import { describe, expect, it } from "vitest";
import type { TagOptionsInput } from "./tag";
import { UdtDefinition } from "./udt";
import { buildResolvedUdtRows } from "$lib/client/editor/udtBuilder";
import {
  z_UdtDefinitionInput,
  type UdtDefinitionInput,
  type UdtDefinitionTagInput,
} from "$lib/sqlite/tables/udt_definitions";

function child(overrides: Partial<UdtDefinitionTagInput> = {}): UdtDefinitionTagInput {
  return {
    id: "child-a",
    name: "AChild",
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

function definition(children: UdtDefinitionTagInput[]): UdtDefinitionInput {
  return {
    id: "def-1",
    name: "Motor",
    properties: { prefix: "motor" },
    children,
  };
}

function parent(overrides: Partial<TagOptionsInput> = {}): TagOptionsInput {
  return {
    id: "tag-1",
    folderId: null,
    name: "M1",
    dataType: "Motor",
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
    udtDefinitionId: "def-1",
    ...overrides,
  };
}

describe("UdtDefinition", () => {
  it("parses the drizzle-derived input schema", () => {
    const parsed = z_UdtDefinitionInput.safeParse(definition([child()]));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.children).toHaveLength(1);
  });

  it("sorts children alphanumerically", () => {
    const udt = new UdtDefinition(
      definition([
        child({ id: "child-10", name: "Point10" }),
        child({ id: "child-2", name: "Point2" }),
        child({ id: "child-a", name: "AChild" }),
      ]),
    );

    expect(udt.children.map((item) => item.name)).toEqual(["AChild", "Point2", "Point10"]);
  });

  it("builds flat child tags with instance properties and deterministic ids", () => {
    const defs = { Motor: definition([child()]) };
    const rows = buildResolvedUdtRows(parent({ properties: { prefix: "instance" } }), defs);
    const built = rows.find((item) => item.name === "AChild");

    expect(built).toMatchObject({
      id: "tag-1:child-a",
      name: "AChild",
      dataType: "Double",
      parentTagId: "tag-1",
      udtDefinitionId: null,
      udtDefinitionChildId: "child-a",
      properties: { prefix: "instance" },
    });
  });

  it("applies only the explicit override fields over the definition", () => {
    const defs = {
      Motor: definition([
        child({ id: "child-a", name: "AChild", unit: "V", driverPath: "definition/path" }),
      ]),
    };
    const preserved = new Map<string, TagOptionsInput>([
      [
        "tag-1:child-a",
        {
          ...parent(),
          id: "tag-1:child-a",
          name: "AChild",
          dataType: "Double",
          parentTagId: "tag-1",
          udtDefinitionChildId: "child-a",
          udtOverrides: { unit: "A", readonly: true },
        },
      ],
    ]);
    const rows = buildResolvedUdtRows(parent(), defs, preserved);
    const built = rows.find((item) => item.id === "tag-1:child-a");

    expect(built).toMatchObject({
      id: "tag-1:child-a",
      unit: "A",
      driverPath: "definition/path",
      readonly: true,
      udtOverrides: { unit: "A", readonly: true },
    });
  });

  it("resolves UDT bindings with tagConfig and properties", () => {
    const defs = {
      Motor: definition([
        child({
          id: "child-a",
          name: "AChild",
          bindings: { driverPath: '"[" + properties.prefix + "]path"' },
        }),
      ]),
    };
    const rows = buildResolvedUdtRows(parent({ properties: { prefix: "instance" } }), defs);
    expect(rows.find((item) => item.id === "tag-1:child-a")?.driverPath).toBe("[instance]path");
  });
});
