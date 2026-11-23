import type { TagProperties } from "$lib/sqlite/tagProperties";
import type { UdtDefinitionInput } from "$lib/sqlite/tables/udt_definitions";
import type { TagOptionsInput, UdtTagOverrides } from "$lib/server/tag/tag";
import { scriptEvaluator } from "./scriptEvaluator";
import { inheritedTagFieldValue } from "./udtOverrides";
import { applyUdtOverrides } from "$lib/tagOverrides";

function instanceProps(tag: TagOptionsInput): TagProperties {
  if (tag.properties && typeof tag.properties === "object" && !Array.isArray(tag.properties)) {
    return tag.properties as TagProperties;
  }
  return {};
}

/**
 * Builds base child rows for a UDT instance.
 * Base rows contain definition defaults, inherited values, and resolved definition bindings;
 * explicit instance overrides are attached separately for later materialization.
 */
function buildChildren(
  parent: TagOptionsInput,
  definition: UdtDefinitionInput,
  definitionsByName: Record<string, UdtDefinitionInput>,
  preserved: Map<string, TagOptionsInput>,
): TagOptionsInput[] {
  const effectiveParent = applyUdtOverrides(parent);
  const properties = {
    ...definition.properties,
    ...instanceProps(effectiveParent),
  } as TagProperties;
  const rows: TagOptionsInput[] = [];

  for (const child of definition.children) {
    const id = `${parent.id}:${child.id}`;
    const saved = preserved.get(id);
    const overrides = (saved?.udtOverrides ?? {}) as UdtTagOverrides;
    const bindings = { ...(child.bindings ?? {}) };

    const base: TagOptionsInput = {
      ...child,
      exposeOverOpcua: child.exposeOverOpcua ?? effectiveParent.exposeOverOpcua,
      readonly: child.readonly ?? effectiveParent.readonly,
      writeLevel: child.writeLevel ?? effectiveParent.writeLevel,
      trendEnabled: child.trendEnabled ?? effectiveParent.trendEnabled,
      trendMinimumSamplingIntervalMs:
        child.trendMinimumSamplingIntervalMs ?? effectiveParent.trendMinimumSamplingIntervalMs,
      properties,
      bindings,
      ...(saved?.initalValue !== undefined ? { initalValue: saved.initalValue } : {}),
      id,
      folderId: null,
      parentTagId: parent.id,
      udtDefinitionChildId: child.id,
      udtOverrides: overrides,
    };

    const resolved = scriptEvaluator.resolveUdtChildBindings(base, properties);
    const childDefinition = definitionsByName[resolved.dataType];
    const effective: TagOptionsInput = {
      ...resolved,
      bindings,
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

/**
 * Normalizes the root row into a base/default configuration.
 * Legacy effective values that still equal their override are converted back into defaults.
 */
function normalizeRootBase(
  instance: TagOptionsInput,
  definition: UdtDefinitionInput,
  definitionsByName: Record<string, UdtDefinitionInput>,
): TagOptionsInput {
  const base: TagOptionsInput = { ...instance, udtDefinitionId: definition.id };
  const overrides = instance.udtOverrides ?? {};
  const tagsById = { [instance.id]: instance };

  for (const [key, override] of Object.entries(overrides)) {
    if (key === "properties" || key === "bindings") continue;
    if (JSON.stringify((instance as Record<string, unknown>)[key]) !== JSON.stringify(override)) {
      continue;
    }
    (base as Record<string, unknown>)[key] = inheritedTagFieldValue(
      instance,
      key as keyof TagOptionsInput,
      definitionsByName,
      tagsById,
    );
  }

  const properties: TagProperties = { ...definition.properties };
  const propertyOverrides = overrides.properties ?? {};
  for (const [key, property] of Object.entries(instanceProps(instance))) {
    const override = propertyOverrides[key];
    if (override && JSON.stringify(property) === JSON.stringify(override)) continue;
    properties[key] = property;
  }
  base.properties = properties;
  base.udtOverrides = instance.udtOverrides ?? null;

  return base;
}

/**
 * Builds base/default rows for a UDT instance and its flattened children.
 */
export function buildResolvedUdtRows(
  instance: TagOptionsInput,
  definitionsByName: Record<string, UdtDefinitionInput>,
  preserved: Map<string, TagOptionsInput> = new Map(),
): TagOptionsInput[] {
  const definition = definitionsByName[instance.dataType];
  if (!definition) return [instance];

  const parent = normalizeRootBase(instance, definition, definitionsByName);

  return [parent, ...buildChildren(parent, definition, definitionsByName, preserved)];
}

/**
 * Applies overrides and evaluates all binding expressions to produce the effective tag object
 * that is persisted and sent to the server.
 */
export function materializeUdtRow(row: TagOptionsInput): TagOptionsInput {
  const effective = applyUdtOverrides(row);
  const properties = (effective.properties ?? {}) as TagProperties;

  for (const [key, expression] of Object.entries(effective.bindings ?? {})) {
    if (!expression?.trim()) continue;

    const evaluation = scriptEvaluator.evaluateTag(expression, {
      tagConfig: effective,
      properties,
    });
    if (evaluation.isErr() || evaluation.value === undefined) continue;

    (effective as Record<string, unknown>)[key] = evaluation.value;
  }

  return effective;
}

/**
 * Materializes a list of base UDT rows into effective tag objects.
 */
export function materializeUdtRows(rows: TagOptionsInput[]): TagOptionsInput[] {
  return rows.map(materializeUdtRow);
}

/**
 * Builds fully materialized effective rows for a UDT instance.
 */
export function buildEffectiveUdtRows(
  instance: TagOptionsInput,
  definitionsByName: Record<string, UdtDefinitionInput>,
  preserved: Map<string, TagOptionsInput> = new Map(),
): TagOptionsInput[] {
  return materializeUdtRows(buildResolvedUdtRows(instance, definitionsByName, preserved));
}
