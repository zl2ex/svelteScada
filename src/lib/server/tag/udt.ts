import type { UdtDefinitionInput, UdtDefinitionTagInput } from "$lib/sqlite/tables/udt_definitions";
import type { TagOptionsInput, UdtTagOverrides } from "./tag";
import type { TagProperties } from "$lib/sqlite/tagProperties";

export function compareTagNames(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function sortUdtChildren<T extends { name: string }>(children: T[]) {
  return [...children].sort((a, b) => compareTagNames(a.name, b.name));
}

export class UdtDefinition {
  id: string;
  name: string;
  properties: TagProperties;
  children: UdtDefinitionTagInput[];

  constructor(input: UdtDefinitionInput) {
    this.id = input.id;
    this.name = input.name;
    this.properties = input.properties ?? {};
    this.children = sortUdtChildren(input.children ?? []);
  }

  toInput(): UdtDefinitionInput {
    return {
      id: this.id,
      name: this.name,
      properties: this.properties,
      children: sortUdtChildren(this.children),
    };
  }

  getChild(id: string) {
    return this.children.find((child) => child.id === id);
  }
}
