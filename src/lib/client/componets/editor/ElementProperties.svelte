<script lang="ts">
  import { getEditorContext } from "$lib/client/editor/editorContext";
  import { getAbilityContext } from "$lib/client/permissions/abilityContext";
  import type { ContainerType } from "$lib/elements/elementTypes";
  import { containerTypes, isContainerElement } from "$lib/elements/elementTypes";
  import { toast } from "$lib/client/toast.svelte";
  import {
    attributeBindingScope,
    coerceAttributeValue,
    formatBindingResult,
    getBindingMap,
    getStyle,
    getTopLevelAttributes,
    removeStyleRow,
    removeTopLevelAttributeRow,
    setBinding,
    setStyleProperty,
    setTopLevelAttribute,
    type AttributeBindingScope,
    type BindingScope,
    type ElementBindingRowData,
  } from "$lib/client/editor/elementBindingRows";
  import { getTagValueMapContext } from "$lib/client/live/tagMapContext";
  import { evaluateExpression, type BindingContext } from "$lib/client/editor/elementExpressions";
  import { neverThrowErrorToString } from "$lib/util/neverThrow";
  import ElementBindingRow from "./ElementBindingRow.svelte";
  import ElementBindingSection from "./ElementBindingSection.svelte";
  import ElementEventsEditor from "./ElementEventsEditor.svelte";
  import ElementStyleClassSection from "./ElementStyleClassSection.svelte";

  const editor = getEditorContext();
  const ability = getAbilityContext();
  const tagValueMap = getTagValueMapContext();
  const containerOptions = containerTypes;

  let containerType = $state<ContainerType>("none");

  let selected = $derived(
    editor.selectedElementIds.length === 1
      ? editor.elementsCollection?.state[editor.selectedElementIds[0]]
      : null,
  );
  let selectedIsContainer = $derived(isContainerElement(selected));
  let showStyle = $derived(!!selected && selected.kind !== "user-component");
  let attributeScope = $derived<AttributeBindingScope>(
    selected ? attributeBindingScope(selected) : "attributes",
  );

  let bindingContext = $derived.by(() => {
    const element = selected;
    if (!element) return null;
    return {
      tag: (lookup: string) => tagValueMap.tag(lookup),
      tagValue: (lookup: string) => tagValueMap.tagValue(lookup),
      tagStatus: (lookup: string) => tagValueMap.tagStatus(lookup),
      props: {},
      element,
    } satisfies BindingContext;
  });

  $effect(() => {
    const element = selected;
    if (!element) return;
    containerType = element.containerType;
  });

  function evaluateBinding(expression: string, context: BindingContext | null) {
    if (!expression.trim() || !context) return { result: "", error: null };
    const evaluation = evaluateExpression(expression, context);
    if (evaluation.isErr()) {
      return { result: "", error: neverThrowErrorToString(evaluation.error) };
    }
    return { result: formatBindingResult(evaluation.value), error: null };
  }

  let textRow = $derived.by((): ElementBindingRowData | null => {
    const element = selected;
    if (!element) return null;
    const binding = element.bindings?.text ?? "";
    const evaluation = evaluateBinding(binding, bindingContext);
    return {
      key: "text",
      value: element.text ?? "",
      binding,
      result: evaluation.result,
      error: evaluation.error,
    };
  });

  let attributeRows = $derived.by((): ElementBindingRowData[] => {
    const element = selected;
    if (!element) return [];
    const base = getTopLevelAttributes(element);
    const bindings = getBindingMap(element, attributeScope);
    const keys = [...new Set([...Object.keys(base), ...Object.keys(bindings)])].sort();
    return keys.map((key) => {
      const binding = bindings[key] ?? "";
      const value = base[key];
      const evaluation = evaluateBinding(binding, bindingContext);
      return {
        key,
        value: value === undefined ? "" : String(value),
        binding,
        result: evaluation.result,
        error: evaluation.error,
      };
    });
  });

  let styleRows = $derived.by((): ElementBindingRowData[] => {
    const element = selected;
    if (!element) return [];
    const base = getStyle(element);
    const bindings = getBindingMap(element, "style");
    const keys = [...new Set([...Object.keys(base), ...Object.keys(bindings)])].sort();
    return keys.map((key) => {
      const binding = bindings[key] ?? "";
      const evaluation = evaluateBinding(binding, bindingContext);
      return {
        key,
        value: base[key] ?? "",
        binding,
        result: evaluation.result,
        error: evaluation.error,
      };
    });
  });

  function saveText(value: string) {
    if (!selected) return;
    editor.elementsCollection?.update(selected.id, {
      text: value === "" ? null : value,
      updatedAt: Date.now(),
    });
  }

  function saveAttributeValue(key: string, raw: string) {
    if (!selected) return;
    const previous = getTopLevelAttributes(selected)[key];
    const value = raw === "" ? null : coerceAttributeValue(previous, raw);
    editor.elementsCollection?.update(selected.id, {
      attributes: setTopLevelAttribute(selected, key, value),
      updatedAt: Date.now(),
    });
  }

  function saveStyleValue(property: string, raw: string) {
    if (!selected) return;
    editor.elementsCollection?.update(selected.id, {
      style: setStyleProperty(selected, property, raw === "" ? null : raw),
      updatedAt: Date.now(),
    });
  }

  function saveBinding(scope: BindingScope, key: string, expression: string) {
    if (!selected) return;
    editor.elementsCollection?.update(selected.id, {
      bindings: setBinding(selected, scope, key, expression),
      updatedAt: Date.now(),
    });
  }

  function addAttribute(key: string, value: string) {
    if (!selected) return false;
    if (
      Object.hasOwn(getTopLevelAttributes(selected), key) ||
      Object.hasOwn(getBindingMap(selected, attributeScope), key)
    ) {
      toast({ kind: "error", title: "Attribute already exists", description: key });
      return false;
    }
    editor.elementsCollection?.update(selected.id, {
      attributes: setTopLevelAttribute(selected, key, value),
      updatedAt: Date.now(),
    });
    return true;
  }

  function addStyleRow(key: string, value: string) {
    if (!selected) return false;
    if (
      Object.hasOwn(getStyle(selected), key) ||
      Object.hasOwn(getBindingMap(selected, "style"), key)
    ) {
      toast({ kind: "error", title: "Style property already exists", description: key });
      return false;
    }
    editor.elementsCollection?.update(selected.id, {
      style: setStyleProperty(selected, key, value),
      updatedAt: Date.now(),
    });
    return true;
  }

  function removeAttributeRow(row: ElementBindingRowData) {
    if (!selected) return;
    const next = removeTopLevelAttributeRow(selected, attributeScope, row.key);
    editor.elementsCollection?.update(selected.id, {
      ...next,
      updatedAt: Date.now(),
    });
  }

  function removeStyle(row: ElementBindingRowData) {
    if (!selected) return;
    const next = removeStyleRow(selected, row.key);
    editor.elementsCollection?.update(selected.id, {
      ...next,
      updatedAt: Date.now(),
    });
  }

  function saveContainer(value: ContainerType) {
    if (!selected) return;
    containerType = value;
    editor.elementsCollection?.update(selected.id, {
      containerType: value,
      updatedAt: Date.now(),
    });
  }
</script>

<div class="flex flex-col text-xs">
  <fieldset class="contents" disabled={!ability.can("update", "Element")}>
    {#if !selected}
      <p class="p-3 opacity-50">Select an element to edit its properties.</p>
    {:else}
      <div class="p-3 flex flex-col gap-3">
        <div class="flex items-center justify-between gap-2">
          <div class="min-w-0">
            <div class="font-semibold truncate">{selected.name || selected.id}</div>
            <div class="opacity-50 truncate">
              {selected.kind}{selected.tag ? ` · ${selected.tag}` : ""}
            </div>
          </div>
        </div>

        {#if textRow}
          <ElementBindingRow
            label="Text"
            value={textRow.value}
            binding={textRow.binding}
            result={textRow.result}
            multiline
            onValueCommit={saveText}
            onBindingSave={(expression) => saveBinding("text", "text", expression)}
            onBindingRemove={() => saveBinding("text", "text", "")}
          />
        {/if}

        {#if selectedIsContainer}
          <label class="flex flex-col gap-1">
            <span class="opacity-60">Container</span>
            <select
              class="input h-7 py-0 px-1"
              value={containerType}
              onchange={(event) => saveContainer(event.currentTarget.value as ContainerType)}
            >
              {#each containerOptions as option}
                <option value={option}>{option}</option>
              {/each}
            </select>
          </label>
        {:else}
          <p class="opacity-50">This element is not a container.</p>
        {/if}

        <ElementBindingSection
          title={attributeScope === "props" ? "Props" : "Attributes"}
          rows={attributeRows}
          keyPlaceholder={attributeScope === "props" ? "prop" : "attribute"}
          valuePlaceholder="value"
          onAdd={addAttribute}
          onValueCommit={(row, value) => saveAttributeValue(row.key, value)}
          onBindingSave={(row, expression) => saveBinding(attributeScope, row.key, expression)}
          onBindingRemove={(row) => saveBinding(attributeScope, row.key, "")}
          onRemoveRow={removeAttributeRow}
        />

        {#if showStyle}
          <ElementBindingSection
            title="Style"
            rows={styleRows}
            keyPlaceholder="property"
            valuePlaceholder="value"
            onAdd={addStyleRow}
            onValueCommit={(row, value) => saveStyleValue(row.key, value)}
            onBindingSave={(row, expression) => saveBinding("style", row.key, expression)}
            onBindingRemove={(row) => saveBinding("style", row.key, "")}
            onRemoveRow={removeStyle}
          />
        {/if}

        <ElementStyleClassSection element={selected} />

        <ElementEventsEditor />
      </div>
    {/if}
  </fieldset>
</div>
