import type { TagOptionsInput } from "$lib/sqlite/tagOptions";

export function isTagOptions(node: object): node is TagOptionsInput {
  return (
    Object.hasOwn(node, "id") && Object.hasOwn(node, "name") && Object.hasOwn(node, "dataType")
  );
}

export function isUdtTag(node: TagOptionsInput) {
  return node.udtDefinitionId != null;
}
