import { describe, expect, it } from "vitest";
import { elementPropertyKeys, tagPropertyKeys } from "./propertyKeys";
import type { ElementRecord } from "$lib/elements/elementTypes";
import type { TagOptionsInput } from "$lib/server/tag/tag";

function element(overrides: Partial<ElementRecord> = {}): ElementRecord {
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
    bindings: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as ElementRecord;
}

function tag(overrides: Partial<TagOptionsInput> = {}): TagOptionsInput {
  return {
    id: "tag",
    name: "tag",
    dataType: "Double",
    properties: null,
    ...overrides,
  } as TagOptionsInput;
}

describe("elementPropertyKeys", () => {
  it("includes base component defaults and instance properties", () => {
    const keys = elementPropertyKeys([
      element({
        kind: "base-component",
        baseComponent: "TagInput",
        properties: {
          custom: { value: "x", description: "Custom value", required: true },
        },
      }),
    ]);

    expect(keys.map((entry) => entry.key)).toEqual(["custom", "id", "label"]);
    expect(keys.find((entry) => entry.key === "custom")?.description).toBe("Custom value");
  });

  it("includes referenced user component properties and descriptions", () => {
    const keys = elementPropertyKeys(
      [
        element({
          kind: "user-component",
          referencedComponentId: "component-1",
        }),
      ],
      [
        {
          component: {
            id: "component-1",
            properties: {
              label: { value: "Label", description: "Visible label", required: true },
              value: { value: 0, required: true },
            },
          },
        },
      ],
    );

    expect(keys).toEqual([
      { key: "label", description: "Visible label" },
      { key: "value", description: undefined },
    ]);
  });
});

describe("tagPropertyKeys", () => {
  it("merges UDT, instance and override keys with descriptions", () => {
    const keys = tagPropertyKeys(
      [
        tag({
          dataType: "AnalogIn",
          properties: {
            instance: { value: 1, description: "Instance value", required: true },
          },
          udtOverrides: {
            properties: { override: { value: "x", required: true } },
          },
        }),
      ],
      {
        AnalogIn: {
          properties: {
            device: { value: "plc", description: "PLC name", required: true },
            description: { value: "", description: "Tag description", required: false },
          },
        },
      },
    );

    expect(keys.map((entry) => entry.key)).toEqual([
      "description",
      "device",
      "instance",
      "override",
    ]);
    expect(keys.find((entry) => entry.key === "device")?.description).toBe("PLC name");
    expect(keys.find((entry) => entry.key === "instance")?.description).toBe("Instance value");
  });
});
