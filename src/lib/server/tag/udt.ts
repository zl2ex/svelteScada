import type { UdtDefinitionInput, UdtDefinitionTagInput } from "$lib/sqlite/tables/udt_definitions";
import type { TagOptionsInput, UdtTagOverrides } from "./tag";
import type { TagProperties } from "$lib/sqlite/tagProperties";

/**
 * Compares tag names using numeric-aware, case-insensitive locale ordering.
 *
 * @param a - First name to compare.
 * @param b - Second name to compare.
 * @returns Negative, zero or positive number per standard sort ordering.
 */
export function compareTagNames(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Returns a sorted copy of UDT children by name.
 *
 * @param children - Child definitions to sort.
 * @returns New array sorted by `compareTagNames`.
 */
export function sortUdtChildren<T extends { name: string }>(children: T[]) {
  return [...children].sort((a, b) => compareTagNames(a.name, b.name));
}

export class UdtDefinition {
  id: string;
  name: string;
  properties: TagProperties;
  children: UdtDefinitionTagInput[];

  /**
   * Creates a UDT definition, defaulting properties and sorting children.
   */
  constructor(input: UdtDefinitionInput) {
    this.id = input.id;
    this.name = input.name;
    this.properties = input.properties ?? {};
    this.children = sortUdtChildren(input.children ?? []);
  }

  /**
   * Builds a plain input object from this definition with sorted children.
   *
   * @returns `UdtDefinitionInput` representation of this definition.
   */
  toInput(): UdtDefinitionInput {
    return {
      id: this.id,
      name: this.name,
      properties: this.properties,
      children: sortUdtChildren(this.children),
    };
  }

  /**
   * Finds a direct child definition by id.
   *
   * @param id - Child definition id to find.
   * @returns The matching child, or undefined when not present.
   */
  getChild(id: string) {
    return this.children.find((child) => child.id === id);
  }
}
