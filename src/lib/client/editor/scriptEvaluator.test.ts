import { describe, expect, it, vi } from "vitest";
import type { TagOptionsInput } from "$lib/server/tag/tag";
import { scriptEvaluator } from "./scriptEvaluator";
import { EditorScriptEvaluator } from "./scriptEvaluatorContext";
import type { ElementRecord } from "$lib/elements/elementTypes";

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

describe("scriptEvaluator", () => {
  it("evaluates tag expressions", () => {
    const config = tagOptions();
    const result = scriptEvaluator.evaluateTag('tagConfig.driverPath + ":resolved"', {
      tagConfig: config,
      properties: {},
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toBe("ns=1;s=old:resolved");
  });

  it("resolves tag bindings without mutating the source", () => {
    const config = tagOptions({
      bindings: {
        driverPath: 'tagConfig.driverPath + ":resolved"',
        unit: '"V"',
      },
    });

    const resolved = scriptEvaluator.resolveTagBindings(config);

    expect(resolved.driverPath).toBe("ns=1;s=old:resolved");
    expect(resolved.unit).toBe("V");
    expect(config.driverPath).toBe("ns=1;s=old");
    expect(config.unit).toBe("");
  });

  it("validates event scripts without running them", () => {
    expect(scriptEvaluator.validateScript("const value = tagValue('tag');").isOk()).toBe(true);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const invalid = scriptEvaluator.validateScript("const value = ;");
    errorSpy.mockRestore();

    expect(invalid.isErr()).toBe(true);
  });
});

describe("EditorScriptEvaluator", () => {
  const tagValueMap = {
    tag: () => undefined,
    tagValue: () => undefined,
    tagStatus: () => "unknown",
  } as never;
  const udts = { state: {} } as never;

  function element(bindings: ElementRecord["bindings"]): ElementRecord {
    return {
      id: "element",
      parentId: null,
      sortIndex: 0,
      kind: "html",
      tag: "div",
      baseComponent: null,
      referencedComponentId: null,
      name: "element",
      text: null,
      attributes: {},
      properties: {},
      style: {},
      styleClass: [],
      bindings,
      createdAt: 0,
      updatedAt: 0,
    } as ElementRecord;
  }

  it("reports a tag binding evaluation error", () => {
    const evaluator = new EditorScriptEvaluator({ udts, tagValueMap });
    const error = evaluator.tagError(tagOptions({ bindings: { driverPath: "1 +" } }));

    expect(error?.scope).toBe("bindings");
    expect(error?.key).toBe("driverPath");
  });

  it("reports an event script compile error", () => {
    const evaluator = new EditorScriptEvaluator({ udts, tagValueMap });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = evaluator.elementError(element({ events: { click: "const value = ;" } }));
    errorSpy.mockRestore();

    expect(error?.scope).toBe("events");
    expect(error?.key).toBe("click");
  });

  it("returns null for valid element bindings", () => {
    const evaluator = new EditorScriptEvaluator({ udts, tagValueMap });
    const error = evaluator.elementError(element({ events: { click: "const value = 1;" } }));

    expect(error).toBeNull();
  });

  it("exposes getElementById to element bindings", () => {
    const evaluator = new EditorScriptEvaluator({ udts, tagValueMap });
    const parent = { ...element(null), id: "parent", name: "Parent" };
    const child = { ...element(null), parentId: "parent" };

    const result = evaluator.evaluateElementFor(
      child,
      'getElementById(element.parentId).name',
      (id) => (id === "parent" ? parent : undefined),
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toBe("Parent");
  });
});
