import { describe, expect, it } from "vitest";
import type { TagOptionsInput } from "$lib/server/tag/tag";
import {
  evaluateTagBinding,
  resolveTagBindings,
  type TagBindingContext,
} from "$lib/client/editor/tagExpressions";
import { z_TagOptionsInsert } from "$lib/sqlite/tagOptions";

function tagOptions(overrides: Partial<TagOptionsInput> = {}): TagOptionsInput {
  return {
    id: "tag-1",
    folderId: null,
    name: "Test Tag",
    dataType: "Double",
    initalValue: "1",
    driverPath: "ns=1;s=old",
    readonly: false,
    exposeOverOpcua: true,
    properties: null,
    unit: "",
    bindings: null,
    trendEnabled: true,
    trendMinimumSamplingIntervalMs: 1000,
    ...overrides,
  };
}

function context(config: TagOptionsInput): TagBindingContext {
  return {
    tagConfig: config,
    properties: {},
  };
}

describe("tag binding expressions", () => {
  it("evaluates expressions with TagOptionsInput available as tagConfig", () => {
    const config = tagOptions();

    const driverPath = evaluateTagBinding('tagConfig.driverPath + ":resolved"', context(config));
    expect(driverPath.isOk()).toBe(true);
    if (driverPath.isOk()) expect(driverPath.value).toBe("ns=1;s=old:resolved");

    const readonly = evaluateTagBinding("tagConfig.readonly === true", context(config));
    expect(readonly.isOk()).toBe(true);
    if (readonly.isOk()) expect(readonly.value).toBe(false);
  });

  it("resolves editable fields without mutating the source config or removing bindings", () => {
    const config = tagOptions({
      bindings: {
        driverPath: 'tagConfig.driverPath + ":resolved"',
        dataType: '"String"',
        initalValue: 'tagConfig.initalValue + "0"',
        readonly: "true",
        exposeOverOpcua: "null",
        properties: "({ source: tagConfig.driverPath })",
        unit: '"V"',
        trendEnabled: "false",
        trendMinimumSamplingIntervalMs: "100",
      },
    });

    const resolved = resolveTagBindings(config);

    expect(resolved).toMatchObject({
      driverPath: "ns=1;s=old:resolved",
      dataType: "String",
      initalValue: "10",
      readonly: true,
      exposeOverOpcua: null,
      properties: { source: "ns=1;s=old" },
      unit: "V",
      trendEnabled: false,
      trendMinimumSamplingIntervalMs: 100,
      bindings: config.bindings,
    });
    expect(config).toMatchObject({
      driverPath: "ns=1;s=old",
      dataType: "Double",
      initalValue: "1",
      readonly: false,
      unit: "",
    });
  });

  it("keeps static values for undefined results and preserves valid null results", () => {
    const config = tagOptions({
      bindings: {
        driverPath: "undefined",
        initalValue: "null",
      },
    });

    const resolved = resolveTagBindings(config);

    expect(resolved.driverPath).toBe("ns=1;s=old");
    expect(resolved.initalValue).toBeNull();
  });

  it("evaluates expressions with properties", () => {
    const config = tagOptions();
    const evaluation = evaluateTagBinding('properties.prefix + ":" + tagConfig.name', {
      tagConfig: config,
      properties: { prefix: "motor" },
    });

    expect(evaluation.isOk()).toBe(true);
    if (evaluation.isOk()) expect(evaluation.value).toBe("motor:Test Tag");
  });

  it("does not expose live tag readers to tag bindings", () => {
    const config = tagOptions();

    for (const expression of ["typeof tag", "typeof tagValue", "typeof tagStatus"]) {
      const evaluation = evaluateTagBinding(expression, context(config));
      expect(evaluation.isOk()).toBe(true);
      if (evaluation.isOk()) expect(evaluation.value).toBe("undefined");
    }
  });

  it("validates persisted tag binding expressions", () => {
    const valid = z_TagOptionsInsert.safeParse(
      tagOptions({ bindings: { driverPath: '"ns=1;s=resolved"' } }),
    );
    const invalid = z_TagOptionsInsert.safeParse({
      ...tagOptions(),
      bindings: { driverPath: 42 },
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });
});
