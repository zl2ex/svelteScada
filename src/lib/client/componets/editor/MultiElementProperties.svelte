<script lang="ts">
  import { getEditorContext } from "$lib/client/editor/editorContext";
  import { getAbilityContext } from "$lib/client/permissions/abilityContext";
  import { getTagValueMapContext } from "$lib/client/live/tagMapContext";
  import type { ElementRecord } from "$lib/elements/elementTypes";
  import { evaluateExpression, type BindingContext } from "$lib/client/editor/elementExpressions";
  import { formatBindingResult } from "$lib/client/editor/bindings";
  import { neverThrowErrorToString } from "$lib/util/neverThrow";
  import {
    coerceAttributeValue,
    getBindingMap,
    getStyle,
    getTopLevelAttributes,
    setBinding,
    setStyleProperty,
    setTopLevelAttribute,
    type AttributeBindingScope,
    type BindingScope,
    type ElementBindingRowData,
  } from "$lib/client/editor/elementBindingRows";
  import ElementBindingRow from "./ElementBindingRow.svelte";
  import ElementBindingSection from "./ElementBindingSection.svelte";

  const editor = getEditorContext();
  const ability = getAbilityContext();
  const tagValueMap = getTagValueMapContext();

  let elements = $derived(editor.selectedElements);

  let bindingScope = $derived<AttributeBindingScope>(
    elements.length > 0 && elements.every((element) => element.kind === "user-component")
      ? "props"
      : "attributes",
  );

  function commonStrings(values: string[]): { value: string; mixed: boolean } {
    if (values.length === 0) return { value: "", mixed: false };
    const first = values[0];
    return values.every((value) => value === first)
      ? { value: first, mixed: false }
      : { value: "", mixed: true };
  }

  function commonAttributeValues(values: Array<string | number | boolean>) {
    if (values.length === 0) return { value: "", mixed: false };
    const first = values[0];
    return values.every((value) => value === first)
      ? { value: String(first), mixed: false }
      : { value: "", mixed: true };
  }

  function commonKeysFor(items: Array<Record<string, unknown>>) {
    if (items.length === 0) return [];
    return Object.keys(items[0])
      .filter((key) => items.every((item) => Object.hasOwn(item, key)))
      .sort();
  }

  let commonName = $derived(commonStrings(elements.map((element) => element.name)));

  let attributeKeys = $derived(
    commonKeysFor(
      elements.map((element) => ({
        ...getTopLevelAttributes(element),
        ...getBindingMap(element, bindingScope),
      })),
    ),
  );

  let styleKeys = $derived(
    commonKeysFor(
      elements.map((element) => ({
        ...getStyle(element),
        ...getBindingMap(element, "style"),
      })),
    ),
  );

  let commonTextBinding = $derived(
    elements.length > 0 && elements.every((element) => Boolean(element.bindings?.text?.trim()))
      ? commonStrings(elements.map((element) => element.bindings?.text ?? ""))
      : null,
  );

  function bindingContext(element: ElementRecord): BindingContext {
    return {
      tag: (lookup: string) => tagValueMap.tag(lookup),
      tagValue: (lookup: string) => tagValueMap.tagValue(lookup),
      tagStatus: (lookup: string) => tagValueMap.tagStatus(lookup),
      props: {},
      element,
    };
  }

  function evaluateBinding(element: ElementRecord, expression: string) {
    if (!expression.trim()) return { result: "", error: null };
    const evaluation = evaluateExpression(expression, bindingContext(element));
    if (evaluation.isErr()) {
      return { result: "", error: neverThrowErrorToString(evaluation.error) };
    }
    return { result: formatBindingResult(evaluation.value), error: null };
  }

  function commonBinding(scope: BindingScope, key: string) {
    const values = elements.map((element) =>
      scope === "text"
        ? (element.bindings?.text ?? "")
        : (getBindingMap(element, scope)[key] ?? ""),
    );
    return commonStrings(values);
  }

  function commonResult(
    scope: BindingScope,
    key: string,
    expression: string,
  ): { result: string; error: string | null } {
    const evaluated = elements.map((element) => evaluateBinding(element, expression));
    const results = commonStrings(evaluated.map((item) => item.result));
    const error = evaluated.find((item) => item.error)?.error ?? null;
    return {
      result: results.mixed ? "Mixed" : results.value,
      error,
    };
  }

  let attributeRows = $derived(
    attributeKeys.map((key) => {
      const common = commonAttributeValues(
        elements.map((element) => getTopLevelAttributes(element)[key] ?? ""),
      );
      const binding = commonBinding(bindingScope, key);
      const result = binding.value
        ? commonResult(bindingScope, key, binding.value)
        : { result: "", error: null };
      return {
        key,
        value: common.mixed ? "" : common.value,
        binding: binding.mixed ? "" : binding.value,
        result: result.result,
        error: result.error,
        placeholder: common.mixed ? "<multiple_values>" : undefined,
      } satisfies ElementBindingRowData;
    }),
  );

  let styleRows = $derived(
    styleKeys.map((key) => {
      const common = commonStrings(elements.map((element) => getStyle(element)[key] ?? ""));
      const binding = commonBinding("style", key);
      const result = binding.value
        ? commonResult("style", key, binding.value)
        : { result: "", error: null };
      return {
        key,
        value: common.mixed ? "" : common.value,
        binding: binding.mixed ? "" : binding.value,
        result: result.result,
        error: result.error,
        placeholder: common.mixed ? "<multiple_values>" : undefined,
      } satisfies ElementBindingRowData;
    }),
  );

  function updateAll(changesFor: (element: ElementRecord) => Partial<ElementRecord>) {
    editor.elementsCollection?.updateMany(
      elements.map((element) => ({
        id: element.id,
        changes: { ...changesFor(element), updatedAt: Date.now() },
      })),
    );
  }

  function saveName(raw: string) {
    const value = raw === "" ? "" : raw;
    updateAll(() => ({ name: value }));
  }

  function addAttribute(key: string, value: string) {
    if (!key.trim()) return false;
    if (attributeKeys.includes(key)) return false;
    updateAll((element) => ({
      attributes: setTopLevelAttribute(element, key, coerceAttributeValue(undefined, value)),
    }));
    return true;
  }

  function addStyle(key: string, value: string) {
    if (!key.trim()) return false;
    if (styleKeys.includes(key)) return false;
    updateAll((element) => ({
      style: setStyleProperty(element, key, value),
    }));
    return true;
  }

  function saveAttribute(row: ElementBindingRowData, raw: string) {
    updateAll((element) => ({
      attributes: setTopLevelAttribute(
        element,
        row.key,
        coerceAttributeValue(getTopLevelAttributes(element)[row.key], raw),
      ),
    }));
  }

  function saveStyle(row: ElementBindingRowData, raw: string) {
    updateAll((element) => ({
      style: setStyleProperty(element, row.key, raw),
    }));
  }

  function saveBinding(scope: BindingScope, key: string, expression: string) {
    updateAll((element) => ({
      bindings: setBinding(element, scope, key, expression),
    }));
  }

  function removeAttribute(row: ElementBindingRowData) {
    updateAll((element) => ({
      attributes: setTopLevelAttribute(element, row.key, null),
      bindings: setBinding(element, bindingScope, row.key, ""),
    }));
  }

  function removeStyle(row: ElementBindingRowData) {
    updateAll((element) => ({
      style: setStyleProperty(element, row.key, null),
      bindings: setBinding(element, "style", row.key, ""),
    }));
  }

  function saveTextBinding(expression: string) {
    updateAll((element) => ({ bindings: setBinding(element, "text", "text", expression) }));
  }
</script>

<div class="flex flex-col text-xs">
  <fieldset class="contents" disabled={!ability.can("update", "Element")}>
    <div class="p-3 flex flex-col gap-3">
      <div class="font-semibold">{elements.length} elements selected</div>

      <label class="flex flex-col gap-1">
        <span class="opacity-60">Name</span>
        <input
          class="input placeholder:opacity-50 h-7 py-0 px-2"
          value={commonName.mixed ? "" : commonName.value}
          placeholder={commonName.mixed ? "Mixed" : ""}
          onblur={(event) => saveName(event.currentTarget.value)}
        />
      </label>

      <ElementBindingSection
        title={bindingScope === "props" ? "Props" : "Attributes"}
        rows={attributeRows}
        keyPlaceholder={bindingScope === "props" ? "prop" : "attribute"}
        valuePlaceholder="value"
        onAdd={addAttribute}
        onValueCommit={saveAttribute}
        onBindingSave={(row, expression) => saveBinding(bindingScope, row.key, expression)}
        onBindingRemove={(row) => saveBinding(bindingScope, row.key, "")}
        onRemoveRow={removeAttribute}
      />

      <ElementBindingSection
        title="Style"
        rows={styleRows}
        keyPlaceholder="property"
        valuePlaceholder="value"
        onAdd={addStyle}
        onValueCommit={saveStyle}
        onBindingSave={(row, expression) => saveBinding("style", row.key, expression)}
        onBindingRemove={(row) => saveBinding("style", row.key, "")}
        onRemoveRow={removeStyle}
      />

      {#if commonTextBinding}
        <div class="flex flex-col gap-2">
          <div class="font-semibold opacity-80">Text</div>
          <ElementBindingRow
            label="text"
            value={commonTextBinding.mixed ? "" : commonTextBinding.value}
            binding={commonTextBinding.mixed ? "" : commonTextBinding.value}
            placeholder={commonTextBinding.mixed ? "<multiple_values>" : ""}
            result=""
            onValueCommit={() => {}}
            onBindingSave={saveTextBinding}
            onBindingRemove={() => saveTextBinding("")}
          />
        </div>
      {/if}
    </div>
  </fieldset>
</div>
