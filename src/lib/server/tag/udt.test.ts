import { describe, expect, it } from "vitest";
import type { TagOptionsInput } from "./tag";
import { UdtDefinition } from "./udt";
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
    type: "tag",
    initalValue: null,
    nodeId: null,
    writeable: true,
    exposeOverOpcua: true,
    parameters: null,
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
    props: { prefix: "motor" },
    children,
  };
}

function parent(overrides: Partial<TagOptionsInput> = {}): TagOptionsInput {
  return {
    id: "tag-1",
    folderId: null,
    name: "M1",
    dataType: "Motor",
    type: "tag",
    initalValue: null,
    nodeId: null,
    writeable: true,
    exposeOverOpcua: true,
    parameters: null,
    unit: "",
    bindings: null,
    writeLevel: "operator",
    trendEnabled: false,
    trendMinimumSamplingIntervalMs: 1000,
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

  it("builds flat child tags with instance props and deterministic ids", () => {
    const udt = new UdtDefinition(definition([child()]));
    const built = udt
      .buildInstanceOptions(parent({ parameters: { prefix: "instance" } }))
      .find((item) => item.name === "AChild");

    expect(built).toMatchObject({
      id: "tag-1:child-a",
      name: "AChild",
      dataType: "Double",
      parentTagId: "tag-1",
      udtDefinitionId: "def-1",
      udtDefinitionChildId: "child-a",
      parameters: { prefix: "instance" },
    });
  });

  it("applies only the explicit override fields over the definition", () => {
    const udt = new UdtDefinition(
      definition([child({ id: "child-a", name: "AChild", unit: "V", nodeId: "definition/path" })]),
    );
    const built = udt.buildInstanceOptions(parent(), {
      "child-a": { unit: "A", writeable: false },
    })[0];

    expect(built).toMatchObject({
      id: "tag-1:child-a",
      unit: "A",
      nodeId: "definition/path",
      writeable: false,
      udtOverrides: { unit: "A", writeable: false },
    });
  });
});
