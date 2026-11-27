import type { TagOptionsInput } from "$lib/sqlite/tagOptions";

/**
 * Type guard checking whether an object looks like tag options.
 *
 * @param node - Object to inspect
 * @returns True when the object owns `id`, `name`, and `dataType` keys
 */
export function isTagOptions(node: object): node is TagOptionsInput {
  return (
    Object.hasOwn(node, "id") && Object.hasOwn(node, "name") && Object.hasOwn(node, "dataType")
  );
}

/**
 * Checks whether a tag is backed by a user-defined type definition.
 *
 * @param node - Tag options to inspect
 * @returns True when `udtDefinitionId` is present and non-null
 */
export function isUdtTag(node: TagOptionsInput) {
  return node.udtDefinitionId != null;
}
