import { formatBindingResult } from "$lib/client/editor/bindings";
import type { BindingContext } from "$lib/client/editor/elementExpressions";
import type { ElementLookup } from "$lib/client/editor/elementLookup";
import { scriptEvaluator } from "$lib/client/editor/scriptEvaluator";
import type { TagValueMap } from "$lib/client/live/tagMap.svelte";
import type { ElementRecord } from "$lib/elements/elementTypes";
import { neverThrowErrorToString } from "$lib/util/neverThrow";
import {
  getBindingMap,
  getElementProperties,
  getStyle,
  getTopLevelAttributes,
  type AttributeBindingScope,
  type BindingScope,
  type InputWithBindingRow,
} from "$lib/client/editor/elementBindingRows";

export type ElementCollectionUpdater = {
  /**
   * Applies batched record updates to the collection.
   * @param items - Updates keyed by element id.
   */
  updateMany(items: { id: string; changes: Partial<Omit<ElementRecord, "id">> }[]): void;
} | null;

const noElementLookup: ElementLookup = () => undefined;

/**
 * Finds a common string across values and reports whether they differ.
 * @param values - Values to compare.
 * @returns The shared value, or an empty string with mixed set when they differ.
 */
export function commonStrings(values: string[]): { value: string; mixed: boolean } {
  if (values.length === 0) return { value: "", mixed: false };
  const first = values[0];
  return values.every((value) => value === first)
    ? { value: first, mixed: false }
    : { value: "", mixed: true };
}

/**
 * Finds a common attribute value across values and reports whether they differ.
 * @param values - Values to compare.
 * @returns The shared value as a string, or empty with mixed set when they differ.
 */
export function commonAttributeValues(values: Array<string | number | boolean>) {
  if (values.length === 0) return { value: "", mixed: false };
  const first = values[0];
  return values.every((value) => value === first)
    ? { value: String(first), mixed: false }
    : { value: "", mixed: true };
}

/**
 * Finds keys present on every record.
 * @param items - Records to intersect.
 * @returns Sorted shared keys.
 */
export function commonKeysFor(items: Array<Record<string, unknown>>) {
  if (items.length === 0) return [];
  if (items.length === 1) return Object.keys(items[0]).sort();
  return Object.keys(items[0])
    .filter((key) => items.every((item) => Object.hasOwn(item, key)))
    .sort();
}

/**
 * Builds a binding context backed by a tag value map.
 * @param element - Element whose bindings are evaluated.
 * @param tagValueMap - Tag lookup source.
 * @param [getElementById] - Element lookup exposed to scripts.
 * @returns The binding context.
 */
export function bindingContextFor(
  element: ElementRecord,
  tagValueMap: TagValueMap,
  getElementById: ElementLookup = noElementLookup,
): BindingContext {
  return {
    tag: (lookup) => tagValueMap.tag(lookup),
    tagValue: (lookup) => tagValueMap.tagValue(lookup),
    tagStatus: (lookup) => tagValueMap.tagStatus(lookup),
    element,
    getElementById,
  };
}

/**
 * Evaluates a binding expression against an element's context.
 * @param element - Element whose binding is evaluated.
 * @param expression - Binding expression.
 * @param tagValueMap - Tag lookup source.
 * @param [getElementById] - Element lookup exposed to scripts.
 * @returns The formatted result and any evaluation error.
 */
export function evaluateElementBinding(
  element: ElementRecord,
  expression: string,
  tagValueMap: TagValueMap,
  getElementById: ElementLookup = noElementLookup,
) {
  if (!expression.trim()) return { result: "", error: null };
  const evaluation = scriptEvaluator.evaluateElement(
    expression,
    bindingContextFor(element, tagValueMap, getElementById),
  );
  if (evaluation.isErr()) {
    return { result: "", error: neverThrowErrorToString(evaluation.error) };
  }
  return { result: formatBindingResult(evaluation.value), error: null };
}

/**
 * Finds a common binding expression across elements.
 * @param elements - Elements to compare.
 * @param scope - Binding scope.
 * @param key - Binding key.
 * @returns The shared binding value and mixed flag.
 */
export function commonBinding(elements: ElementRecord[], scope: BindingScope, key: string) {
  const values = elements.map((element) =>
    scope === "text" ? (element.bindings?.text ?? "") : (getBindingMap(element, scope)[key] ?? ""),
  );
  return commonStrings(values);
}

/**
 * Evaluates an expression across elements and finds a common result.
 * @param elements - Elements to evaluate.
 * @param expression - Binding expression.
 * @param tagValueMap - Tag lookup source.
 * @param [getElementById] - Element lookup exposed to scripts.
 * @returns The common result, or "Mixed" when values differ, plus any error.
 */
export function commonResult(
  elements: ElementRecord[],
  expression: string,
  tagValueMap: TagValueMap,
  getElementById: ElementLookup = noElementLookup,
) {
  const evaluated = elements.map((element) =>
    evaluateElementBinding(element, expression, tagValueMap, getElementById),
  );
  const results = commonStrings(evaluated.map((item) => item.result));
  const error = evaluated.find((item) => item.error)?.error ?? null;
  return {
    result: results.mixed ? "Mixed" : results.value,
    error,
  };
}

/**
 * Builds a display row for a shared style key.
 * @param elements - Elements to inspect.
 * @param key - Style property name.
 * @param tagValueMap - Tag lookup source.
 * @param [getElementById] - Element lookup exposed to scripts.
 * @returns The style row data.
 */
export function styleRowFor(
  elements: ElementRecord[],
  key: string,
  tagValueMap: TagValueMap,
  getElementById: ElementLookup = noElementLookup,
): InputWithBindingRow {
  const common = commonStrings(elements.map((element) => getStyle(element)[key] ?? ""));
  const binding = commonBinding(elements, "style", key);
  const result = binding.value
    ? commonResult(elements, binding.value, tagValueMap, getElementById)
    : { result: "", error: null };

  return {
    key,
    value: common.mixed ? "" : common.value,
    binding: binding.mixed ? "" : binding.value,
    result: result.result,
    error: result.error,
    placeholder: common.mixed || binding.mixed ? "<multiple_values>" : undefined,
  };
}

/**
 * Builds display rows for style keys shared by all elements.
 * @param elements - Elements to inspect.
 * @param tagValueMap - Tag lookup source.
 * @param [getElementById] - Element lookup exposed to scripts.
 * @returns The style rows.
 */
export function buildStyleRows(
  elements: ElementRecord[],
  tagValueMap: TagValueMap,
  getElementById: ElementLookup = noElementLookup,
): InputWithBindingRow[] {
  const keys = commonKeysFor(
    elements.map((element) => ({
      ...getStyle(element),
      ...getBindingMap(element, "style"),
    })),
  );
  return keys.map((key) => styleRowFor(elements, key, tagValueMap, getElementById));
}

/**
 * Builds display rows for attribute or property keys shared by all elements.
 * @param elements - Elements to inspect.
 * @param scope - Attribute binding scope.
 * @param tagValueMap - Tag lookup source.
 * @param [getElementById] - Element lookup exposed to scripts.
 * @returns The attribute rows.
 */
export function buildAttributeRows(
  elements: ElementRecord[],
  scope: AttributeBindingScope,
  tagValueMap: TagValueMap,
  getElementById: ElementLookup = noElementLookup,
): InputWithBindingRow[] {
  const keys = commonKeysFor(
    elements.map((element) => ({
      ...(scope === "properties" ? getElementProperties(element) : getTopLevelAttributes(element)),
      ...getBindingMap(element, scope),
    })),
  );

  return keys.map((key) => {
    const values = elements.map((element) => {
      if (scope === "properties") return getElementProperties(element)[key]?.value ?? "";
      return getTopLevelAttributes(element)[key] ?? "";
    });
    const common = commonAttributeValues(values);
    const propertyValues = elements.map((element) =>
      scope === "properties" ? getElementProperties(element)[key] : undefined,
    );
    const descriptions = propertyValues.map((property) => property?.description ?? "");
    const commonDescription = commonStrings(descriptions);
    const required =
      scope === "properties" && propertyValues.some((property) => property?.required ?? true);
    const binding = commonBinding(elements, scope, key);
    const result = binding.value
      ? commonResult(elements, binding.value, tagValueMap, getElementById)
      : { result: "", error: null };

    return {
      key,
      value: common.mixed ? "" : common.value,
      binding: binding.mixed ? "" : binding.value,
      result: result.result,
      error: result.error,
      placeholder: common.mixed ? "<multiple_values>" : undefined,
      description: commonDescription.mixed ? undefined : commonDescription.value || undefined,
      required,
    } satisfies InputWithBindingRow;
  });
}

/**
 * Applies computed changes to elements through a collection updater.
 * @param collection - Collection updater, or null to skip.
 * @param elements - Elements to update.
 * @param changesFor - Computes the changes for each element.
 */
export function updateElements(
  collection: ElementCollectionUpdater,
  elements: ElementRecord[],
  changesFor: (element: ElementRecord) => Partial<ElementRecord>,
) {
  if (!collection || elements.length === 0) return;
  const now = Date.now();
  collection.updateMany(
    elements.map((element) => ({
      id: element.id,
      changes: { ...changesFor(element), updatedAt: now },
    })),
  );
}
