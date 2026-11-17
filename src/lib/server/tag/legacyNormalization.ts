import type { TagOptionsInput } from "$lib/sqlite/tagOptions";
import type { UdtDefinitionTagInput } from "$lib/sqlite/tables/udt_definitions";

type UnknownRecord = Record<string, unknown>;

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
