import type { UdtDefinitionInput, UdtDefinitionTagInput } from "$lib/sqlite/tables/udt_definitions";
import type { TagOptionsInput, UdtTagOverrides } from "$lib/server/tag/tag";
import type { PropertyMap, PropertyValue } from "$lib/propertyValue";
import type { TagProperties } from "$lib/sqlite/tagProperties";

const STRUCTURAL_KEYS = new Set([
  "id",
  "parentTagId",
  "udtDefinitionId",
  "udtDefinitionChildId",
  "udtOverrides",
  "createdAt",
  "updatedAt",
]);

function valueEquals(a: unknown, b: unknown) {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function propertyMetadataEqual(a: PropertyValue, b: PropertyValue) {
  return (
    a.value === b.value &&
    (a.description ?? "") === (b.description ?? "") &&
    a.required === b.required
  );
}

function defaultRootFieldValue(key: keyof TagOptionsInput): unknown {
  switch (key) {
    case "initalValue":
      return null;
    case "driverPath":
      return null;
    case "readonly":
      return false;
    case "exposeOverOpcua":
      return true;
    case "writeLevel":
      return "operator";
    case "trendEnabled":
      return false;
    case "trendMinimumSamplingIntervalMs":
      return 1000;
    case "unit":
      return "";
    case "bindings":
      return null;
    default:
      return undefined;
  }
}

function childDefinitionFor(
  tag: TagOptionsInput,
  definitionsByName: Record<string, UdtDefinitionInput>,
  tagsById: Record<string, TagOptionsInput>,
): UdtDefinitionTagInput | undefined {
  const parent = tag.parentTagId ? tagsById[tag.parentTagId] : undefined;
  const parentDefinition = parent ? definitionsByName[parent.dataType] : undefined;
  return tag.udtDefinitionChildId
    ? parentDefinition?.children.find((child) => child.id === tag.udtDefinitionChildId)
    : undefined;
}

export function inheritedTagFieldValue(
  tag: TagOptionsInput,
  key: keyof TagOptionsInput,
  definitionsByName: Record<string, UdtDefinitionInput>,
  tagsById: Record<string, TagOptionsInput>,
): unknown {
  const parent = tag.parentTagId ? tagsById[tag.parentTagId] : undefined;
  const childDefinition = childDefinitionFor(tag, definitionsByName, tagsById);
  const definition = definitionsByName[tag.dataType];

  if (childDefinition) {
    switch (key) {
      case "name":
        return childDefinition.name;
      case "dataType":
        return childDefinition.dataType;
      case "driverPath":
        return childDefinition.driverPath ?? null;
      case "initalValue":
        return childDefinition.initalValue ?? null;
      case "readonly":
        return childDefinition.readonly ?? parent?.readonly ?? false;
      case "exposeOverOpcua":
        return childDefinition.exposeOverOpcua ?? parent?.exposeOverOpcua ?? true;
      case "writeLevel":
        return childDefinition.writeLevel ?? parent?.writeLevel ?? "operator";
      case "trendEnabled":
        return childDefinition.trendEnabled ?? parent?.trendEnabled ?? false;
      case "trendMinimumSamplingIntervalMs":
        return (
          childDefinition.trendMinimumSamplingIntervalMs ??
          parent?.trendMinimumSamplingIntervalMs ??
          1000
        );
      case "unit":
        return childDefinition.unit ?? "";
      case "properties":
        return parent?.properties ?? {};
      case "bindings":
        return childDefinition.bindings ?? null;
      default:
        return tag[key];
    }
  }

  switch (key) {
    case "name":
      return definition?.name ?? tag.name;
    case "dataType":
      return definition?.name ?? tag.dataType;
    case "properties":
      return definition?.properties ?? {};
    default: {
      const fallback = defaultRootFieldValue(key);
      return fallback === undefined ? tag[key] : fallback;
    }
  }
}

export function explicitPropertiesFrom(
  properties: PropertyMap,
  definitionProperties: PropertyMap,
): PropertyMap {
  const explicit: PropertyMap = {};
  for (const [key, property] of Object.entries(properties)) {
    const definitionProperty = definitionProperties[key];
    if (definitionProperty && propertyMetadataEqual(property, definitionProperty)) continue;
    explicit[key] = property;
  }
  return explicit;
}

export function buildUdtOverrides(
  tag: TagOptionsInput,
  changes: Partial<Omit<TagOptionsInput, "id">>,
  definition: UdtDefinitionInput | undefined,
  childDefinition: UdtDefinitionTagInput | undefined,
): UdtTagOverrides | null {
  if (!definition && !childDefinition) return null;

  const overrides: UdtTagOverrides = { ...(tag.udtOverrides ?? {}) };
  const source = (childDefinition ?? definition) as Record<string, unknown>;

  for (const [key, value] of Object.entries(changes)) {
    if (STRUCTURAL_KEYS.has(key)) continue;

    if (key === "properties") {
      const definitionProperties = (childDefinition?.properties ??
        definition?.properties ??
        {}) as PropertyMap;
      const properties = (value ?? {}) as PropertyMap;
      const explicit = explicitPropertiesFrom(properties, definitionProperties);
      if (Object.keys(explicit).length > 0) overrides.properties = explicit;
      else delete overrides.properties;
      continue;
    }

    if (key === "bindings") {
      const definitionBindings = (childDefinition?.bindings ?? {}) as Record<string, string>;
      const nextBindings = (value ?? {}) as Record<string, string>;
      const explicit: Record<string, string> = {};
      for (const [bindingKey, bindingValue] of Object.entries(nextBindings)) {
        if (bindingValue === definitionBindings[bindingKey]) continue;
        explicit[bindingKey] = bindingValue;
      }
      if (Object.keys(explicit).length > 0)
        overrides.bindings = explicit as UdtTagOverrides["bindings"];
      else delete overrides.bindings;
      continue;
    }

    const definitionValue = source[key];
    if (valueEquals(value, definitionValue)) {
      delete overrides[key as keyof UdtTagOverrides];
    } else {
      (overrides as Record<string, unknown>)[key] = value;
    }
  }

  return overrides;
}
