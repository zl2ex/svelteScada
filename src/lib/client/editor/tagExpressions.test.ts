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
    nodeId: "ns=1;s=old",
    writeable: true,
    exposeOverOpcua: true,
    parameters: null,
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
  };
}

describe("tag binding expressions", () => {
  it("evaluates expressions with TagOptionsInput available as tagConfig", () => {
    const config = tagOptions();

    const nodeId = evaluateTagBinding('tagConfig.nodeId + ":resolved"', context(config));
    expect(nodeId.isOk()).toBe(true);
    if (nodeId.isOk()) expect(nodeId.value).toBe("ns=1;s=old:resolved");

    const writeable = evaluateTagBinding("tagConfig.writeable === true", context(config));
    expect(writeable.isOk()).toBe(true);
    if (writeable.isOk()) expect(writeable.value).toBe(true);
  });

  it("resolves editable fields without mutating the source config or removing bindings", () => {
    const config = tagOptions({
      bindings: {
        nodeId: 'tagConfig.nodeId + ":resolved"',
        dataType: '"String"',
        initalValue: 'tagConfig.initalValue + "0"',
        writeable: "false",
        exposeOverOpcua: "null",
        parameters: "({ source: tagConfig.nodeId })",
        unit: '"V"',
        trendEnabled: "false",
        trendMinimumSamplingIntervalMs: "100",
      },
    });

    const resolved = resolveTagBindings(config);

    expect(resolved).toMatchObject({
      nodeId: "ns=1;s=old:resolved",
      dataType: "String",
      initalValue: "10",
      writeable: false,
      exposeOverOpcua: null,
      parameters: { source: "ns=1;s=old" },
      unit: "V",
      trendEnabled: false,
      trendMinimumSamplingIntervalMs: 100,
      bindings: config.bindings,
    });
    expect(config).toMatchObject({
      nodeId: "ns=1;s=old",
      dataType: "Double",
      initalValue: "1",
      writeable: true,
      unit: "",
    });
  });

  it("keeps static values for undefined results and preserves valid null results", () => {
    const config = tagOptions({
      bindings: {
        nodeId: "undefined",
        initalValue: "null",
      },
    });

    const resolved = resolveTagBindings(config);

    expect(resolved.nodeId).toBe("ns=1;s=old");
    expect(resolved.initalValue).toBeNull();
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
      tagOptions({ bindings: { nodeId: '"ns=1;s=resolved"' } }),
    );
    const invalid = z_TagOptionsInsert.safeParse({
      ...tagOptions(),
      bindings: { nodeId: 42 },
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });
});
