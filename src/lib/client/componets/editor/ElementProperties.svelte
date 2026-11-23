<script lang="ts">
  import { getEditorContext } from "$lib/client/editor/editorContext";
  import { getAbilityContext } from "$lib/client/permissions/abilityContext";
  import { toast } from "$lib/client/toast.svelte";
  import {
    attributeBindingScope,
    coerceAttributeValue,
    formatBindingResult,
    getElementProperties,
    getBindingMap,
    getStyle,
    getTopLevelAttributes,
    removeElementPropertyRow,
    removeStyleRow,
    removeTopLevelAttributeRow,
    setBinding,
    setElementPropertyValue,
    setStyleProperty,
    setTopLevelAttribute,
    type AttributeBindingScope,
    type BindingScope,
    type ElementBindingRowData,
  } from "$lib/client/editor/elementBindingRows";
  import { getTagValueMapContext } from "$lib/client/live/tagMapContext";
  import type { BindingContext } from "$lib/client/editor/elementExpressions";
  import { scriptEvaluator } from "$lib/client/editor/scriptEvaluator";
  import { neverThrowErrorToString } from "$lib/util/neverThrow";
  import ElementBindingRow from "./ElementBindingRow.svelte";
  import ElementBindingSection from "./ElementBindingSection.svelte";
  import ElementEventsEditor from "./ElementEventsEditor.svelte";
  import ElementStyleClassSection from "./ElementStyleClassSection.svelte";

  const editor = getEditorContext();
  const ability = getAbilityContext();
  const tagValueMap = getTagValueMapContext();


  let selected = $derived(
    editor.selectedElementIds.length === 1
      ? editor.elementsCollection?.state[editor.selectedElementIds[0]]
      : null,
  );
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

  function evaluateBinding(expression: string, context: BindingContext | null) {
    if (!expression.trim() || !context) return { result: "", error: null };
    const evaluation = scriptEvaluator.evaluateElement(expression, context);
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
    const usesProperties = attributeScope === "props";
    const base = usesProperties ? getElementProperties(element) : getTopLevelAttributes(element);
    const bindings = getBindingMap(element, attributeScope);
    const keys = [...new Set([...Object.keys(base), ...Object.keys(bindings)])].sort();
    return keys.map((key) => {
      const binding = bindings[key] ?? "";
      const raw = base[key];
      const value =
        usesProperties && raw && typeof raw === "object" && "value" in raw
          ? raw.value
          : raw;
      const property =
        usesProperties && raw && typeof raw === "object" && "value" in raw
          ? raw
          : undefined;
      const evaluation = evaluateBinding(binding, bindingContext);
      return {
        key,
        value: value === undefined ? "" : String(value),
        binding,
        result: evaluation.result,
        error: evaluation.error,
        description: property?.description,
        required: usesProperties ? (property?.required ?? true) : false,
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
    const usesProperties = attributeScope === "props";
    if (usesProperties) {
      const previous = getElementProperties(selected)[key]?.value;
      const value = raw === "" ? null : coerceAttributeValue(previous, raw);
      editor.elementsCollection?.update(selected.id, {
        properties: setElementPropertyValue(selected, key, value),
        updatedAt: Date.now(),
      });
      return;
    }
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
    const usesProperties = attributeScope === "props";
    const base = usesProperties ? getElementProperties(selected) : getTopLevelAttributes(selected);
    if (Object.hasOwn(base, key) || Object.hasOwn(getBindingMap(selected, attributeScope), key)) {
      toast({ kind: "error", title: "Attribute already exists", description: key });
      return false;
    }
    editor.elementsCollection?.update(selected.id, {
      ...(usesProperties
        ? {
            properties: setElementPropertyValue(selected, key, coerceAttributeValue(undefined, value), {
              required: false,
            }),
          }
        : { attributes: setTopLevelAttribute(selected, key, value) }),
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
    if (!selected || row.required) return;
    const next =
      attributeScope === "props"
        ? removeElementPropertyRow(selected, row.key)
        : removeTopLevelAttributeRow(selected, attributeScope, row.key);
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
