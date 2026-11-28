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
    removeElementPropertyRow,
    removeStyleRow,
    removeTopLevelAttributeRow,
    setBinding,
    setElementPropertyValue,
    setStyleProperty,
    setTopLevelAttribute,
    type BindingScope,
    type InputWithBindingRow,
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
  import { createElementLookup } from "$lib/client/editor/elementLookup";
  import { elementPropertyKeys } from "$lib/client/editor/propertyKeys";
  import InputWithBinding from "./InputWithBinding.svelte";
  import InputWithBindingSection from "./InputWithBindingSection.svelte";
  import ElementEventsEditor from "./ElementEventsEditor.svelte";
  import ElementStyleClassSection from "./ElementStyleClassSection.svelte";
  import ElementAppearanceEditor from "./ElementAppearanceEditor.svelte";

  const editor = getEditorContext();
  const ability = getAbilityContext();
  const tagValueMap = getTagValueMapContext();

  let elements = $derived(editor.selectedElements);
  let selected = $derived(elements.length === 1 ? elements[0] : null);
  let isMulti = $derived(elements.length > 1);
  let showStyle = $derived(
    elements.length > 0 && (elements.length > 1 || selected?.kind !== "user-component"),
  );
  let getElementById = $derived(
    createElementLookup(editor.elementsCollection?.state, editor.userComponents),
  );
  let propertyKeys = $derived(elementPropertyKeys(elements, editor.userComponents));
  let appearanceKeys = $derived(appearanceManagedStyleKeys(elements));
  let attributeRows = $derived(
    buildAttributeRows(elements, "attributes", tagValueMap, getElementById),
  );
  let propertyRows = $derived(
    buildAttributeRows(elements, "properties", tagValueMap, getElementById),
  );
  let styleRows = $derived(
    buildStyleRows(elements, tagValueMap, getElementById).filter(
      (row) => !appearanceKeys.has(row.key),
    ),
  );
  let commonName = $derived(commonStrings(elements.map((element) => element.name)));

  let textRow = $derived.by((): InputWithBindingRow | null => {
    if (elements.length === 0) return null;

    if (elements.length === 1) {
      const element = elements[0];
      const binding = element.bindings?.text ?? "";
      const evaluation = evaluateElementBinding(element, binding, tagValueMap, getElementById);
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

    const result = commonResult(elements, binding.value, tagValueMap, getElementById);
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
   * Saves an attribute value on the selected elements.
   *
   * @param row - Row identifying the attribute key.
   * @param raw - Raw input value; an empty string clears the value.
   */
  function saveAttributeValue(row: InputWithBindingRow, raw: string) {
    updateElements(editor.elementsCollection, elements, (element) => {
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
   * Saves a property value on the selected elements.
   *
   * @param row - Row identifying the property key.
   * @param raw - Raw input value; an empty string clears the value.
   */
  function savePropertyValue(row: InputWithBindingRow, raw: string) {
    updateElements(editor.elementsCollection, elements, (element) => {
      const previous = getElementProperties(element)[row.key]?.value;
      return {
        properties: setElementPropertyValue(
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
  function saveStyleValue(row: InputWithBindingRow, raw: string) {
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
   * Adds an attribute row to the selected elements.
   *
   * @param key - Attribute name; must be non-empty and not already present.
   * @param value - Initial value for the new entry.
   * @returns True when the row was added, false when rejected.
   */
  function addAttribute(key: string, value: string) {
    if (!key.trim()) return false;
    if (attributeRows.some((row) => row.key === key)) return false;

    updateElements(editor.elementsCollection, elements, (element) => ({
      attributes: setTopLevelAttribute(element, key, coerceAttributeValue(undefined, value)),
    }));
    return true;
  }

  /**
   * Adds a property row to the selected elements.
   *
   * @param key - Property name; must be non-empty and not already present.
   * @param value - Initial value for the new entry.
   * @returns True when the row was added, false when rejected.
   */
  function addProperty(key: string, value: string) {
    if (!key.trim()) return false;
    if (propertyRows.some((row) => row.key === key)) return false;

    updateElements(editor.elementsCollection, elements, (element) => ({
      properties: setElementPropertyValue(element, key, coerceAttributeValue(undefined, value), {
        required: false,
      }),
    }));
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
   * Removes an attribute row and its binding unless the row is required.
   *
   * @param row - Row identifying the attribute to remove.
   */
  function removeAttributeRow(row: InputWithBindingRow) {
    if (row.required) return;

    updateElements(editor.elementsCollection, elements, (element) =>
      removeTopLevelAttributeRow(element, row.key),
    );
  }

  /**
   * Removes a property row and its binding unless the row is required.
   *
   * @param row - Row identifying the property to remove.
   */
  function removePropertyRow(row: InputWithBindingRow) {
    if (row.required) return;

    updateElements(editor.elementsCollection, elements, (element) =>
      removeElementPropertyRow(element, row.key),
    );
  }

  /**
   * Removes a style row from the selected elements.
   *
   * @param row - Row identifying the style property to remove.
   */
  function removeStyle(row: InputWithBindingRow) {
    updateElements(editor.elementsCollection, elements, (element) =>
      removeStyleRow(element, row.key),
    );
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
          <InputWithBinding
            label="Text"
            value={textRow.value}
            binding={textRow.binding}
            result={textRow.result}
            savedError={textRow.error}
            placeholder={textRow.placeholder}
            multiline
            {propertyKeys}
            onValueCommit={saveText}
            onBindingSave={(expression) => saveBinding("text", "text", expression)}
            onBindingRemove={() => saveBinding("text", "text", "")}
          />
        {/if}

        <InputWithBindingSection
          mode="element"
          title="Properties"
          rows={propertyRows}
          keyPlaceholder="new property"
          valuePlaceholder="value"
          onAdd={addProperty}
          onValueCommit={savePropertyValue}
          onBindingSave={(row, expression) => saveBinding("properties", row.key, expression)}
          onBindingRemove={(row) => saveBinding("properties", row.key, "")}
          onRemoveRow={removePropertyRow}
          {propertyKeys}
        />

        <InputWithBindingSection
          mode="element"
          title="Attributes"
          rows={attributeRows}
          keyPlaceholder="new attribute"
          valuePlaceholder="value"
          onAdd={addAttribute}
          onValueCommit={saveAttributeValue}
          onBindingSave={(row, expression) => saveBinding("attributes", row.key, expression)}
          onBindingRemove={(row) => saveBinding("attributes", row.key, "")}
          onRemoveRow={removeAttributeRow}
          {propertyKeys}
        />

        {#if showStyle}
          <ElementAppearanceEditor {elements} {propertyKeys} />

          <InputWithBindingSection
            mode="element"
            title="Style"
            rows={styleRows}
            keyPlaceholder="property"
            valuePlaceholder="value"
            onAdd={addStyleRow}
            onValueCommit={saveStyleValue}
            onBindingSave={(row, expression) => saveBinding("style", row.key, expression)}
            onBindingRemove={(row) => saveBinding("style", row.key, "")}
            onRemoveRow={removeStyle}
            {propertyKeys}
          />
        {/if}

        {#if selected}
          <ElementStyleClassSection element={selected} {propertyKeys} />
          <ElementEventsEditor {propertyKeys} />
        {/if}
      </div>
    {/if}
  </fieldset>
</div>
