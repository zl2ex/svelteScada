import type { TagOptionsInput } from "$lib/sqlite/tagOptions";
import type { UdtDefinitionTagInput } from "$lib/sqlite/tables/udt_definitions";

type UnknownRecord = Record<string, unknown>;

/**
 * Migrates legacy binding keys (`nodeId`, `writeable`, `parameters`) to their current names.
 *
 * @param map - Raw bindings map to normalize.
 * @returns Object containing the normalized value and whether any key changed.
 */
function normalizeBindingMap(map: unknown) {
  if (!map || typeof map !== "object" || Array.isArray(map)) {
    return { value: map, changed: false };
  }

  const next: UnknownRecord = { ...(map as UnknownRecord) };
  let changed = false;

  for (const [oldKey, newKey] of [
    ["nodeId", "driverPath"],
    ["writeable", "readonly"],
    ["parameters", "properties"],
  ] as const) {
    if (oldKey in next) {
      if (!(newKey in next)) next[newKey] = next[oldKey];
      delete next[oldKey];
      changed = true;
    }
  }

  return { value: next, changed };
}

/**
 * Migrates legacy UDT override keys to their current names, inverting `writeable` to `readonly`.
 *
 * @param map - Raw UDT overrides map to normalize.
 * @returns Object containing the normalized value and whether any key changed.
 */
function normalizeOverrides(map: unknown) {
  if (!map || typeof map !== "object" || Array.isArray(map)) {
    return { value: map, changed: false };
  }

  const next: UnknownRecord = { ...(map as UnknownRecord) };
  let changed = false;

  for (const [oldKey, newKey] of [
    ["nodeId", "driverPath"],
    ["parameters", "properties"],
  ] as const) {
    if (oldKey in next) {
      if (!(newKey in next)) next[newKey] = next[oldKey];
      delete next[oldKey];
      changed = true;
    }
  }

  if ("writeable" in next) {
    if (!("readonly" in next)) next.readonly = !Boolean(next.writeable);
    delete next.writeable;
    changed = true;
  }

  return { value: next, changed };
}

/**
 * Normalizes legacy keys in a tag options row's bindings and UDT overrides.
 *
 * @param row - Tag options row to normalize.
 * @returns Object containing the normalized options and whether any key changed.
 */
export function normalizeTagOptions(row: TagOptionsInput) {
  const next = { ...row } as TagOptionsInput & UnknownRecord;
  let changed = false;

  const bindings = normalizeBindingMap(next.bindings);
  if (bindings.changed) {
    next.bindings = bindings.value as TagOptionsInput["bindings"];
    changed = true;
  }

  const overrides = normalizeOverrides(next.udtOverrides);
  if (overrides.changed) {
    next.udtOverrides = overrides.value as TagOptionsInput["udtOverrides"];
    changed = true;
  }

  return { value: next as TagOptionsInput, changed };
}

/**
 * Normalizes legacy keys in a UDT definition child tag.
 *
 * @param child - UDT child definition to normalize.
 * @returns Object containing the normalized child and whether any key changed.
 */
export function normalizeUdtChild(child: UdtDefinitionTagInput) {
  const next = { ...child } as UdtDefinitionTagInput & UnknownRecord;
  let changed = false;

  for (const [oldKey, newKey] of [
    ["nodeId", "driverPath"],
    ["parameters", "properties"],
  ] as const) {
    if (oldKey in next) {
      if (!(newKey in next)) next[newKey] = next[oldKey];
      delete next[oldKey];
      changed = true;
    }
  }

  if ("writeable" in next) {
    if (!("readonly" in next)) next.readonly = !Boolean(next.writeable);
    delete next.writeable;
    changed = true;
  }

  const bindings = normalizeBindingMap(next.bindings);
  if (bindings.changed) {
    next.bindings = bindings.value as UdtDefinitionTagInput["bindings"];
    changed = true;
  }

  return { value: next as UdtDefinitionTagInput, changed };
}
