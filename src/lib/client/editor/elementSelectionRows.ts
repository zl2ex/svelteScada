import { formatBindingResult } from "$lib/client/editor/bindings";
import type { BindingContext } from "$lib/client/editor/elementExpressions";
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
  type ElementBindingRowData,
} from "$lib/client/editor/elementBindingRows";

export type ElementCollectionUpdater = {
  updateMany(items: { id: string; changes: Partial<Omit<ElementRecord, "id">> }[]): void;
} | null;

export function commonStrings(values: string[]): { value: string; mixed: boolean } {
  if (values.length === 0) return { value: "", mixed: false };
  const first = values[0];
  return values.every((value) => value === first)
    ? { value: first, mixed: false }
    : { value: "", mixed: true };
}

export function commonAttributeValues(values: Array<string | number | boolean>) {
  if (values.length === 0) return { value: "", mixed: false };
  const first = values[0];
  return values.every((value) => value === first)
    ? { value: String(first), mixed: false }
    : { value: "", mixed: true };
}

export function commonKeysFor(items: Array<Record<string, unknown>>) {
  if (items.length === 0) return [];
  if (items.length === 1) return Object.keys(items[0]).sort();
  return Object.keys(items[0])
    .filter((key) => items.every((item) => Object.hasOwn(item, key)))
    .sort();
}

export function bindingContextFor(
  element: ElementRecord,
  tagValueMap: TagValueMap,
): BindingContext {
  return {
    tag: (lookup) => tagValueMap.tag(lookup),
    tagValue: (lookup) => tagValueMap.tagValue(lookup),
    tagStatus: (lookup) => tagValueMap.tagStatus(lookup),
    props: {},
    element,
  };
}

export function evaluateElementBinding(
  element: ElementRecord,
  expression: string,
  tagValueMap: TagValueMap,
) {
  if (!expression.trim()) return { result: "", error: null };
  const evaluation = scriptEvaluator.evaluateElement(
    expression,
    bindingContextFor(element, tagValueMap),
  );
  if (evaluation.isErr()) {
    return { result: "", error: neverThrowErrorToString(evaluation.error) };
  }
  return { result: formatBindingResult(evaluation.value), error: null };
}

export function commonBinding(elements: ElementRecord[], scope: BindingScope, key: string) {
  const values = elements.map((element) =>
    scope === "text" ? (element.bindings?.text ?? "") : (getBindingMap(element, scope)[key] ?? ""),
  );
  return commonStrings(values);
}

export function commonResult(
  elements: ElementRecord[],
  expression: string,
  tagValueMap: TagValueMap,
) {
  const evaluated = elements.map((element) =>
    evaluateElementBinding(element, expression, tagValueMap),
  );
  const results = commonStrings(evaluated.map((item) => item.result));
  const error = evaluated.find((item) => item.error)?.error ?? null;
  return {
    result: results.mixed ? "Mixed" : results.value,
    error,
  };
}

export function styleRowFor(
  elements: ElementRecord[],
  key: string,
  tagValueMap: TagValueMap,
): ElementBindingRowData {
  const common = commonStrings(elements.map((element) => getStyle(element)[key] ?? ""));
  const binding = commonBinding(elements, "style", key);
  const result = binding.value
    ? commonResult(elements, binding.value, tagValueMap)
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

export function buildStyleRows(
  elements: ElementRecord[],
  tagValueMap: TagValueMap,
): ElementBindingRowData[] {
  const keys = commonKeysFor(
    elements.map((element) => ({
      ...getStyle(element),
      ...getBindingMap(element, "style"),
    })),
  );
  return keys.map((key) => styleRowFor(elements, key, tagValueMap));
}

export function buildAttributeRows(
  elements: ElementRecord[],
  scope: AttributeBindingScope,
  tagValueMap: TagValueMap,
): ElementBindingRowData[] {
  const keys = commonKeysFor(
    elements.map((element) => ({
      ...(scope === "props" ? getElementProperties(element) : getTopLevelAttributes(element)),
      ...getBindingMap(element, scope),
    })),
  );

  return keys.map((key) => {
    const values = elements.map((element) => {
      if (scope === "props") return getElementProperties(element)[key]?.value ?? "";
      return getTopLevelAttributes(element)[key] ?? "";
    });
    const common = commonAttributeValues(values);
    const propertyValues = elements.map((element) =>
      scope === "props" ? getElementProperties(element)[key] : undefined,
    );
    const descriptions = propertyValues.map((property) => property?.description ?? "");
    const commonDescription = commonStrings(descriptions);
    const required =
      scope === "props" && propertyValues.some((property) => property?.required ?? true);
    const binding = commonBinding(elements, scope, key);
    const result = binding.value
      ? commonResult(elements, binding.value, tagValueMap)
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
    } satisfies ElementBindingRowData;
  });
}

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
