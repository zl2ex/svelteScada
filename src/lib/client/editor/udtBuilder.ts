import type { TagProperties } from "$lib/sqlite/tagProperties";
import type { UdtDefinitionInput } from "$lib/sqlite/tables/udt_definitions";
import type { TagOptionsInput, UdtTagOverrides } from "$lib/server/tag/tag";
import { resolveUdtChildBindings } from "./tagExpressions";

function instanceProps(tag: TagOptionsInput): TagProperties {
  if (tag.properties && typeof tag.properties === "object" && !Array.isArray(tag.properties)) {
    return tag.properties as TagProperties;
  }
  return {};
}

function buildChildren(
  parent: TagOptionsInput,
  definition: UdtDefinitionInput,
  definitionsByName: Record<string, UdtDefinitionInput>,
  preserved: Map<string, TagOptionsInput>,
): TagOptionsInput[] {
  const properties = { ...definition.properties, ...instanceProps(parent) };
  const rows: TagOptionsInput[] = [];

  for (const child of definition.children) {
    const id = `${parent.id}:${child.id}`;
    const saved = preserved.get(id);
    const overrides = (saved?.udtOverrides ?? {}) as UdtTagOverrides;

    const base: TagOptionsInput = {
      ...child,
      exposeOverOpcua: child.exposeOverOpcua ?? parent.exposeOverOpcua,
      readonly: child.readonly ?? parent.readonly,
      writeLevel: child.writeLevel ?? parent.writeLevel,
      trendEnabled: child.trendEnabled ?? parent.trendEnabled,
      trendMinimumSamplingIntervalMs:
        child.trendMinimumSamplingIntervalMs ?? parent.trendMinimumSamplingIntervalMs,
      properties,
      ...(saved?.initalValue !== undefined ? { initalValue: saved.initalValue } : {}),
      id,
      folderId: null,
      parentTagId: parent.id,
      udtDefinitionChildId: child.id,
      udtOverrides: overrides,
    };

    const resolved = resolveUdtChildBindings(base, properties);
    const childDefinition = definitionsByName[resolved.dataType];
    const effective: TagOptionsInput = {
      ...resolved,
      ...overrides,
      id,
      parentTagId: parent.id,
      udtDefinitionChildId: child.id,
      udtDefinitionId: childDefinition?.id ?? null,
      udtOverrides: overrides,
    };

    rows.push(effective);

    if (childDefinition) {
      rows.push(...buildChildren(effective, childDefinition, definitionsByName, preserved));
    }
  }

  return rows;
}

export function buildResolvedUdtRows(
  instance: TagOptionsInput,
  definitionsByName: Record<string, UdtDefinitionInput>,
  preserved: Map<string, TagOptionsInput> = new Map(),
): TagOptionsInput[] {
  const definition = definitionsByName[instance.dataType];
  if (!definition) return [instance];

  const parent: TagOptionsInput = {
    ...instance,
    udtDefinitionId: definition.id,
  };

  return [parent, ...buildChildren(parent, definition, definitionsByName, preserved)];
}
