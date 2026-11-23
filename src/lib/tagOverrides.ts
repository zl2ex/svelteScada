import type { TagOptionsInput } from "$lib/server/tag/tag";
import type { TagBindings } from "$lib/tagBindings";
import type { TagProperties } from "$lib/sqlite/tagProperties";

const STRUCTURAL_KEYS = new Set([
  "id",
  "parentTagId",
  "udtDefinitionId",
  "udtDefinitionChildId",
  "udtOverrides",
]);

/**
 * Applies explicit UDT instance overrides on top of a base tag configuration.
 * The input tag is treated as the base/default configuration and is not mutated.
 */
export function applyUdtOverrides(tag: TagOptionsInput): TagOptionsInput {
  const overrides = tag.udtOverrides;
  if (!overrides) return tag;

  const result: TagOptionsInput = { ...tag };

  for (const [key, value] of Object.entries(overrides)) {
    if (STRUCTURAL_KEYS.has(key) || key === "properties" || key === "bindings") continue;
    if (value === undefined) continue;
    (result as Record<string, unknown>)[key] = value;
  }

  if (overrides.properties) {
    result.properties = {
      ...(tag.properties ?? {}),
      ...overrides.properties,
    } as TagProperties;
  }

  if (overrides.bindings) {
    result.bindings = {
      ...(tag.bindings ?? {}),
      ...overrides.bindings,
    } as TagBindings;
  }

  return result;
}
