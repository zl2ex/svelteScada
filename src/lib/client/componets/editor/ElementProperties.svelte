<script lang="ts">
  import { getEditorContext } from "$lib/client/editor/editorContext";
  import { getAbilityContext } from "$lib/client/permissions/abilityContext";
  import { getTagValueMapContext } from "$lib/client/live/tagMapContext";
  import { toast } from "$lib/client/toast.svelte";
  import { commitOrRevert } from "$lib/client/util/use";
  import {
    coerceAttributeValue,
    getElementProperties,
    getStyle,
    getTopLevelAttributes,
    removeStyleRow,
    setBinding,
    setElementPropertyValue,
    setStyleProperty,
    setTopLevelAttribute,
    type AttributeBindingScope,
    type BindingScope,
    type ElementBindingRowData,
  } from "$lib/client/editor/elementBindingRows";
  import {
    buildAttributeRows,
    buildStyleRows,
    commonResult,
    commonStrings,
    evaluateElementBinding,
    updateElements,
  } from "$lib/client/editor/elementSelectionRows";
  import { appearanceManagedStyleKeys } from "$lib/client/editor/elementAppearance";
  import ElementBindingRow from "./ElementBindingRow.svelte";
  import ElementBindingSection from "./ElementBindingSection.svelte";
  import ElementEventsEditor from "./ElementEventsEditor.svelte";
  import ElementStyleClassSection from "./ElementStyleClassSection.svelte";
  import ElementAppearanceEditor from "./ElementAppearanceEditor.svelte";

  const editor = getEditorContext();
  const ability = getAbilityContext();
  const tagValueMap = getTagValueMapContext();

  let elements = $derived(editor.selectedElements);
  let selected = $derived(elements.length === 1 ? elements[0] : null);
  let isMulti = $derived(elements.length > 1);
  let attributeScope = $derived<AttributeBindingScope>(
    elements.length > 0 &&
      elements.every(
        (element) => element.kind === "user-component" || element.kind === "base-component",
      )
      ? "props"
      : "attributes",
  );
  let showStyle = $derived(
    elements.length > 0 && (elements.length > 1 || selected?.kind !== "user-component"),
  );
  let appearanceKeys = $derived(appearanceManagedStyleKeys(elements));
  let attributeRows = $derived(buildAttributeRows(elements, attributeScope, tagValueMap));
  let styleRows = $derived(
    buildStyleRows(elements, tagValueMap).filter((row) => !appearanceKeys.has(row.key)),
  );
  let commonName = $derived(commonStrings(elements.map((element) => element.name)));

  let textRow = $derived.by((): ElementBindingRowData | null => {
    if (elements.length === 0) return null;

    if (elements.length === 1) {
      const element = elements[0];
      const binding = element.bindings?.text ?? "";
      const evaluation = evaluateElementBinding(element, binding, tagValueMap);
      return {
        key: "text",
        value: element.text ?? "",
        binding,
        result: evaluation.result,
        error: evaluation.error,
      };
    }

    const bindings = elements.map((element) => element.bindings?.text ?? "");
    if (!bindings.every((binding) => binding.trim().length > 0)) return null;

    const binding = commonStrings(bindings);
    if (binding.mixed) {
      return {
        key: "text",
        value: "",
        binding: "",
        result: "Mixed",
        error: null,
        placeholder: "<multiple_values>",
      };
    }

    const result = commonResult(elements, binding.value, tagValueMap);
    const value = commonStrings(elements.map((element) => element.text ?? ""));
    return {
      key: "text",
      value: value.mixed ? "" : value.value,
      binding: binding.value,
      result: result.result,
      error: result.error,
      placeholder: value.mixed ? "<multiple_values>" : undefined,
    };
  });

  /**
   * Saves the text value across the selected elements.
   *
   * @param value - New text; an empty string clears it.
   */
  function saveText(value: string) {
    updateElements(editor.elementsCollection, elements, () => ({
      text: value === "" ? null : value,
    }));
  }

  /**
   * Saves the name across the selected elements.
   *
   * @param value - New element name.
   */
  function saveName(value: string) {
    updateElements(editor.elementsCollection, elements, () => ({ name: value }));
  }

  /**
   * Saves an attribute or prop value on the selected elements.
   *
   * @param row - Row identifying the attribute or prop key.
   * @param raw - Raw input value; an empty string clears the value.
   */
  function saveAttributeValue(row: ElementBindingRowData, raw: string) {
    updateElements(editor.elementsCollection, elements, (element) => {
      if (attributeScope === "props") {
        const previous = getElementProperties(element)[row.key]?.value;
        return {
          properties: setElementPropertyValue(
            element,
            row.key,
            raw === "" ? null : coerceAttributeValue(previous, raw),
          ),
        };
      }

      const previous = getTopLevelAttributes(element)[row.key];
      return {
        attributes: setTopLevelAttribute(
          element,
          row.key,
          raw === "" ? null : coerceAttributeValue(previous, raw),
        ),
      };
    });
  }

  /**
   * Saves a style value on the selected elements.
   *
   * @param row - Row identifying the style property key.
   * @param raw - Raw style value; an empty string clears the property.
   */
  function saveStyleValue(row: ElementBindingRowData, raw: string) {
    updateElements(editor.elementsCollection, elements, (element) => ({
      style: setStyleProperty(element, row.key, raw === "" ? null : raw),
    }));
  }

  /**
   * Saves a binding expression for the given scope and key on selected elements.
   *
   * @param scope - Binding scope to write to.
   * @param key - Binding key within the scope.
   * @param expression - Binding expression; an empty string removes it.
   */
  function saveBinding(scope: BindingScope, key: string, expression: string) {
    updateElements(editor.elementsCollection, elements, (element) => ({
      bindings: setBinding(element, scope, key, expression),
    }));
  }

  /**
   * Adds an attribute or prop row to the selected elements.
   *
   * @param key - Attribute or prop name; must be non-empty and not already present.
   * @param value - Initial value for the new entry.
   * @returns True when the row was added, false when rejected.
   */
  function addAttribute(key: string, value: string) {
    if (!key.trim()) return false;
    if (attributeRows.some((row) => row.key === key)) return false;

    updateElements(editor.elementsCollection, elements, (element) =>
      attributeScope === "props"
        ? {
            properties: setElementPropertyValue(
              element,
              key,
              coerceAttributeValue(undefined, value),
              { required: false },
            ),
          }
        : {
            attributes: setTopLevelAttribute(element, key, coerceAttributeValue(undefined, value)),
          },
    );
    return true;
  }

  /**
   * Adds a style row to the selected elements unless it is appearance-managed.
   *
   * @param key - Style property name; must be non-empty and not already present.
   * @param value - Initial style value.
   * @returns True when the row was added, false when rejected.
   */
  function addStyleRow(key: string, value: string) {
    if (!key.trim()) return false;
    if (appearanceKeys.has(key)) {
      toast({
        kind: "error",
        title: "Style managed by Appearance",
        description: `Edit ${key} in the Appearance section.`,
      });
      return false;
    }
    if (styleRows.some((row) => row.key === key)) return false;

    updateElements(editor.elementsCollection, elements, (element) => ({
      style: setStyleProperty(element, key, value),
    }));
    return true;
  }

  /**
   * Removes an attribute or prop row and its binding unless the row is required.
   *
   * @param row - Row identifying the attribute or prop to remove.
   */
  function removeAttributeRow(row: ElementBindingRowData) {
    if (row.required) return;

    updateElements(editor.elementsCollection, elements, (element) => ({
      ...(attributeScope === "props"
        ? { properties: setElementPropertyValue(element, row.key, null) }
        : { attributes: setTopLevelAttribute(element, row.key, null) }),
      bindings: setBinding(element, attributeScope, row.key, ""),
    }));
  }

  /**
   * Removes a style row from the selected elements.
   *
   * @param row - Row identifying the style property to remove.
   */
  function removeStyle(row: ElementBindingRowData) {
    updateElements(editor.elementsCollection, elements, (element) => removeStyleRow(element, row.key));
  }
</script>

<div class="flex flex-col text-xs">
  <fieldset class="contents" disabled={!ability.can("update", "Element")}>
    {#if elements.length === 0}
      <p class="p-3 opacity-50">Select an element to edit its properties.</p>
    {:else}
      <div class="p-3 flex flex-col gap-3">
        {#if isMulti}
          <label class="flex flex-col gap-1">
            <span class="opacity-60">Name</span>
            <input
              class="input placeholder:opacity-50 h-7 py-0 px-2"
              value={commonName.mixed ? "" : commonName.value}
              placeholder={commonName.mixed ? "Mixed" : ""}
              {@attach commitOrRevert((value) => saveName(value))}
            />
          </label>
        {:else if selected}
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <div class="font-semibold truncate">{selected.name || selected.id}</div>
              <div class="opacity-50 truncate">
                {selected.kind}{selected.tag ? ` · ${selected.tag}` : ""}
              </div>
            </div>
          </div>
        {/if}

        {#if textRow}
          <ElementBindingRow
            label="Text"
            value={textRow.value}
            binding={textRow.binding}
            result={textRow.result}
            savedError={textRow.error}
            placeholder={textRow.placeholder}
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
          onValueCommit={saveAttributeValue}
          onBindingSave={(row, expression) => saveBinding(attributeScope, row.key, expression)}
          onBindingRemove={(row) => saveBinding(attributeScope, row.key, "")}
          onRemoveRow={removeAttributeRow}
        />

        {#if showStyle}
          <ElementAppearanceEditor {elements} />

          <ElementBindingSection
            title="Style"
            rows={styleRows}
            keyPlaceholder="property"
            valuePlaceholder="value"
            onAdd={addStyleRow}
            onValueCommit={saveStyleValue}
            onBindingSave={(row, expression) => saveBinding("style", row.key, expression)}
            onBindingRemove={(row) => saveBinding("style", row.key, "")}
            onRemoveRow={removeStyle}
          />
        {/if}

        {#if selected}
          <ElementStyleClassSection element={selected} />
          <ElementEventsEditor />
        {/if}
      </div>
    {/if}
  </fieldset>
</div>
