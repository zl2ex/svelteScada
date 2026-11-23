import { describe, expect, it } from "vitest";
import type { TagOptionsInput } from "./tag";
import { UdtDefinition } from "./udt";
import { buildEffectiveUdtRows, buildResolvedUdtRows } from "$lib/client/editor/udtBuilder";
import { applyUdtOverrides } from "$lib/tagOverrides";
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
    properties: { prefix: { value: "motor", required: true } },
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

  it("materializes definition properties onto the main instance", () => {
    const defs = { Motor: definition([child()]) };
    const rows = buildResolvedUdtRows(parent(), defs);

    expect(rows[0].properties).toEqual({
      prefix: { value: "motor", required: true },
    });
    expect(rows[0].udtOverrides).toBeNull();
  });

  it("keeps explicit instance properties as overrides on the main instance", () => {
    const defs = { Motor: definition([child()]) };
    const rows = buildResolvedUdtRows(
      parent({
        udtOverrides: {
          properties: { prefix: { value: "instance", required: true } },
        },
      }),
      defs,
    );

    expect(rows[0].properties).toEqual({
      prefix: { value: "motor", required: true },
    });
    expect(rows[0].udtOverrides?.properties).toEqual({
      prefix: { value: "instance", required: true },
    });
    expect(applyUdtOverrides(rows[0]).properties).toEqual({
      prefix: { value: "instance", required: true },
    });
  });

  it("materializes override values and binding results into effective top-level fields", () => {
    const defs = { Motor: definition([child()]) };
    const rows = buildEffectiveUdtRows(
      parent({
        bindings: { unit: '"base"' },
        udtOverrides: {
          readonly: true,
          bindings: { unit: '"override"' },
        },
      }),
      defs,
    );

    expect(rows[0].unit).toBe("override");
    expect(rows[0].readonly).toBe(true);
    expect(rows[0].udtOverrides?.bindings).toEqual({ unit: '"override"' });
  });

  it("normalizes legacy effective base values back into overrides", () => {
    const defs = { Motor: definition([child()]) };
    const rows = buildResolvedUdtRows(
      parent({
        unit: "A",
        udtOverrides: { unit: "A" },
      }),
      defs,
    );

    expect(rows[0].unit).toBe("");
    expect(applyUdtOverrides(rows[0]).unit).toBe("A");
  });

  it("builds flat child tags with instance properties and deterministic ids", () => {
    const defs = { Motor: definition([child()]) };
    const rows = buildResolvedUdtRows(
      parent({ properties: { prefix: { value: "instance", required: true } } }),
      defs,
    );
    const built = rows.find((item) => item.name === "AChild");

    expect(built).toMatchObject({
      id: "tag-1:child-a",
      name: "AChild",
      dataType: "Double",
      parentTagId: "tag-1",
      udtDefinitionId: null,
      udtDefinitionChildId: "child-a",
      properties: { prefix: { value: "instance", required: true } },
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
      unit: "V",
      driverPath: "definition/path",
      readonly: false,
      udtOverrides: { unit: "A", readonly: true },
    });
    expect(applyUdtOverrides(built!)).toMatchObject({
      unit: "A",
      readonly: true,
    });
  });

  it("resolves UDT bindings with tagConfig and properties", () => {
    const defs = {
      Motor: definition([
        child({
          id: "child-a",
          name: "AChild",
          bindings: { driverPath: '"[" + properties.prefix.value + "]path"' },
        }),
      ]),
    };
    const rows = buildResolvedUdtRows(
      parent({ properties: { prefix: { value: "instance", required: true } } }),
      defs,
    );
    expect(rows.find((item) => item.id === "tag-1:child-a")?.driverPath).toBe("[instance]path");
  });

  it("resolves child bindings with instance property overrides", () => {
    const defs = {
      Motor: definition([
        child({
          id: "child-a",
          name: "AChild",
          bindings: { driverPath: '"[" + properties.prefix.value + "]path"' },
        }),
      ]),
    };

    const rows = buildResolvedUdtRows(
      parent({
        udtOverrides: {
          properties: { prefix: { value: "instance", required: true } },
        },
      }),
      defs,
    );

    expect(rows.find((item) => item.id === "tag-1:child-a")?.driverPath).toBe("[instance]path");
  });

  it("inherits effective parent fields when building child tags", () => {
    const defs = {
      Motor: definition([child({ id: "child-a", name: "AChild", readonly: null })]),
    };

    const rows = buildResolvedUdtRows(
      parent({ readonly: false, udtOverrides: { readonly: true } }),
      defs,
    );

    expect(rows.find((item) => item.id === "tag-1:child-a")?.readonly).toBe(true);
  });

  it("keeps bindings defined on UDT definition children", () => {
    const defs = {
      Motor: definition([
        child({
          id: "child-a",
          name: "AChild",
          bindings: { driverPath: '"ns=1;s=definition"' },
        }),
      ]),
    };
    const rows = buildResolvedUdtRows(parent(), defs);

    const built = rows.find((item) => item.id === "tag-1:child-a")!;
    expect(built.bindings).toEqual({
      driverPath: '"ns=1;s=definition"',
    });
    expect(applyUdtOverrides(built).bindings).toEqual({
      driverPath: '"ns=1;s=definition"',
    });
  });

  it("merges instance binding overrides over definition bindings", () => {
    const defs = {
      Motor: definition([
        child({
          id: "child-a",
          name: "AChild",
          bindings: { driverPath: '"ns=1;s=definition"', unit: '"V"' },
        }),
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
          udtOverrides: { bindings: { unit: '"A"' } },
        },
      ],
    ]);
    const rows = buildResolvedUdtRows(parent(), defs, preserved);

    const built = rows.find((item) => item.id === "tag-1:child-a")!;
    expect(built.bindings).toEqual({
      driverPath: '"ns=1;s=definition"',
      unit: '"V"',
    });
    expect(applyUdtOverrides(built).bindings).toEqual({
      driverPath: '"ns=1;s=definition"',
      unit: '"A"',
    });
  });

  it("does not erase definition bindings when instance overrides bindings are null", () => {
    const defs = {
      Motor: definition([
        child({
          id: "child-a",
          name: "AChild",
          bindings: { driverPath: '"ns=1;s=definition"' },
        }),
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
          udtOverrides: { bindings: null },
        },
      ],
    ]);
    const rows = buildResolvedUdtRows(parent(), defs, preserved);

    const built = rows.find((item) => item.id === "tag-1:child-a")!;
    expect(built.bindings).toEqual({
      driverPath: '"ns=1;s=definition"',
    });
    expect(applyUdtOverrides(built).bindings).toEqual({
      driverPath: '"ns=1;s=definition"',
    });
  });
});
