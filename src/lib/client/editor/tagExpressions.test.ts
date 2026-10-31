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
    trend: {
      tagId: "tag-1",
      minimumIntervalMs: 1000,
      enabled: true,
    },
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

    expect(evaluateTagBinding('tagConfig.nodeId + ":resolved"', context(config))).toBe(
      "ns=1;s=old:resolved",
    );
    expect(evaluateTagBinding("tagConfig.writeable === true", context(config))).toBe(true);
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
        trend: "({ tagId: tagConfig.id, enabled: false, minimumIntervalMs: 100 })",
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
      trend: { tagId: "tag-1", enabled: false, minimumIntervalMs: 100 },
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

    expect(evaluateTagBinding("typeof tag", context(config))).toBe("undefined");
    expect(evaluateTagBinding("typeof tagValue", context(config))).toBe("undefined");
    expect(evaluateTagBinding("typeof tagStatus", context(config))).toBe("undefined");
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
