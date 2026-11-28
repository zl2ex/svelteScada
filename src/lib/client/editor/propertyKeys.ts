import { baseComponents } from "$lib/elements/baseComponents";
import type { ElementRecord } from "$lib/elements/elementTypes";
import type { PropertyMap } from "$lib/propertyValue";
import type { TagOptionsInput } from "$lib/server/tag/tag";

export type ScriptPropertyKeyInfo = {
  key: string;
  description?: string;
};

type UserComponentPropertySource = {
  component: {
    id: string;
    properties?: PropertyMap | null;
  };
};

type UdtPropertySource = {
  properties?: PropertyMap | null;
};

/**
 * Adds a property key, keeping the first non-empty description.
 *
 * @param keys - Accumulated key map.
 * @param key - Property key to add.
 * @param [description] - Optional property description.
 */
function addKey(
  keys: Map<string, ScriptPropertyKeyInfo>,
  key: string,
  description?: string | null,
) {
  const trimmed = description?.trim();
  const existing = keys.get(key);
  if (!existing) {
    keys.set(key, { key, description: trimmed || undefined });
    return;
  }
  if (!existing.description && trimmed) existing.description = trimmed;
}

/**
 * Collects the property keys available to an element binding script.
 *
 * @param elements - Elements whose bindings are being edited.
 * @param [userComponents] - Loaded user-component definitions.
 * @returns Sorted, deduplicated property keys with descriptions.
 */
export function elementPropertyKeys(
  elements: Iterable<ElementRecord>,
  userComponents: Iterable<UserComponentPropertySource> = [],
): ScriptPropertyKeyInfo[] {
  const definitions = new Map<string, PropertyMap>();
  for (const definition of userComponents) {
    definitions.set(definition.component.id, definition.component.properties ?? {});
  }

  const keys = new Map<string, ScriptPropertyKeyInfo>();
  for (const element of elements) {
    for (const [key, property] of Object.entries(element.properties ?? {})) {
      addKey(keys, key, property.description);
    }

    if (element.kind === "base-component" && element.baseComponent) {
      const base = baseComponents[element.baseComponent];
      for (const [key, property] of Object.entries(base?.defaultProperties ?? {})) {
        addKey(keys, key, property.description);
      }
    }

    if (element.kind === "user-component" && element.referencedComponentId) {
      const properties = definitions.get(element.referencedComponentId);
      for (const [key, property] of Object.entries(properties ?? {})) {
        addKey(keys, key, property.description);
      }
    }
  }

  return [...keys.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Collects the property keys available to a tag binding script.
 *
 * @param tags - Tags whose bindings are being edited.
 * @param [udtDefinitionsByName] - Loaded UDT definitions keyed by name.
 * @returns Sorted, deduplicated property keys with descriptions.
 */
export function tagPropertyKeys(
  tags: Iterable<TagOptionsInput>,
  udtDefinitionsByName: Record<string, UdtPropertySource> = {},
): ScriptPropertyKeyInfo[] {
  const keys = new Map<string, ScriptPropertyKeyInfo>();
  for (const tag of tags) {
    const definition = tag.dataType ? udtDefinitionsByName[tag.dataType] : undefined;
    for (const [key, property] of Object.entries(definition?.properties ?? {})) {
      addKey(keys, key, property.description);
    }
    for (const [key, property] of Object.entries(tag.properties ?? {})) {
      addKey(keys, key, property.description);
    }
    for (const [key, property] of Object.entries(tag.udtOverrides?.properties ?? {})) {
      addKey(keys, key, property.description);
    }
  }

  return [...keys.values()].sort((a, b) => a.key.localeCompare(b.key));
}
