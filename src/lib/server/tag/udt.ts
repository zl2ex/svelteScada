import type { ElementAttributes } from "$lib/elements/elementTypes";
import type { UdtDefinitionInput, UdtDefinitionTagInput } from "$lib/sqlite/tables/udt_definitions";
import type { TagOptionsInput, UdtTagOverrides } from "./tag";

export function compareTagNames(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function sortUdtChildren<T extends { name: string }>(children: T[]) {
  return [...children].sort((a, b) => compareTagNames(a.name, b.name));
}

export class UdtDefinition {
  id: string;
  name: string;
  props: ElementAttributes;
  children: UdtDefinitionTagInput[];

  constructor(input: UdtDefinitionInput) {
    this.id = input.id;
    this.name = input.name;
    this.props = input.props ?? {};
    this.children = sortUdtChildren(input.children ?? []);
  }

  toInput(): UdtDefinitionInput {
    return {
      id: this.id,
      name: this.name,
      props: this.props,
      children: sortUdtChildren(this.children),
    };
  }

  getChild(id: string) {
    return this.children.find((child) => child.id === id);
  }

  buildInstanceOptions(
    parentTagOptions: TagOptionsInput,
    overridesByChildId: Record<string, UdtTagOverrides> = {},
  ): TagOptionsInput[] {
    const instanceProps =
      parentTagOptions.parameters &&
      typeof parentTagOptions.parameters === "object" &&
      !Array.isArray(parentTagOptions.parameters)
        ? (parentTagOptions.parameters as ElementAttributes)
        : {};
    const props = { ...this.props, ...instanceProps };

    return sortUdtChildren(this.children).map((child) => {
      const overrides = overridesByChildId[child.id] ?? {};
      return {
        ...child,
        exposeOverOpcua: child.exposeOverOpcua ?? parentTagOptions.exposeOverOpcua,
        writeable: child.writeable ?? parentTagOptions.writeable,
        writeLevel: child.writeLevel ?? parentTagOptions.writeLevel,
        trendEnabled: child.trendEnabled ?? parentTagOptions.trendEnabled,
        trendMinimumSamplingIntervalMs:
          child.trendMinimumSamplingIntervalMs ?? parentTagOptions.trendMinimumSamplingIntervalMs,
        parameters: props,
        ...overrides,
        id: `${parentTagOptions.id}:${child.id}`,
        folderId: null,
        parentTagId: parentTagOptions.id,
        udtDefinitionId: null,
        udtDefinitionChildId: child.id,
        udtOverrides: overrides,
      };
    });
  }
}
