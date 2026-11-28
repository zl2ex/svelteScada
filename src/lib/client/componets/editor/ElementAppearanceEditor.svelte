<script lang="ts">
  import { getEditorContext } from "$lib/client/editor/editorContext";
  import { getTagValueMapContext } from "$lib/client/live/tagMapContext";
  import {
    removeStyleRow,
    setBinding,
    setStyleProperty,
    type InputExtension,
  } from "$lib/client/editor/elementBindingRows";
  import { styleRowFor, updateElements } from "$lib/client/editor/elementSelectionRows";
  import { createElementLookup } from "$lib/client/editor/elementLookup";
  import {
    appearanceFieldsFor,
    appearanceOptions,
    appearanceSuggestions,
    type AppearanceField,
  } from "$lib/client/editor/elementAppearance";
  import type { ElementRecord } from "$lib/elements/elementTypes";
  import type { ScriptPropertyKeyInfo } from "$lib/client/editor/propertyKeys";
  import InputWithBinding from "./InputWithBinding.svelte";

  let {
    elements,
    propertyKeys,
  }: { elements: ElementRecord[]; propertyKeys?: Iterable<ScriptPropertyKeyInfo> } = $props();

  const editor = getEditorContext();
  const tagValueMap = getTagValueMapContext();

  let fields = $derived(appearanceFieldsFor(elements));
  let themeCss = $derived(editor.activeTheme?.projectStyle ?? "");
  let getElementById = $derived(
    createElementLookup(editor.elementsCollection?.state, editor.userComponents),
  );

  /**
   * Applies a raw style value to the given property across all selected elements.
   *
   * @param property - CSS style property name.
   * @param raw - New value; an empty string clears the property.
   */
  function saveValue(property: string, raw: string) {
    updateElements(editor.elementsCollection, elements, (element) => ({
      style: setStyleProperty(element, property, raw === "" ? null : raw),
    }));
  }

  /**
   * Saves a style binding expression for the given property across selected elements.
   *
   * @param property - CSS style property name.
   * @param expression - Binding expression; an empty string removes the binding.
   */
  function saveBinding(property: string, expression: string) {
    updateElements(editor.elementsCollection, elements, (element) => ({
      bindings: setBinding(element, "style", property, expression),
    }));
  }

  /**
   * Removes the style row for the given property across selected elements.
   *
   * @param property - CSS style property name.
   */
  function removeField(property: string) {
    updateElements(editor.elementsCollection, elements, (element) =>
      removeStyleRow(element, property),
    );
  }

  /**
   * Builds select options for an appearance field.
   *
   * @param field - Appearance field definition.
   * @param value - Current field value.
   * @param mixed - Whether selected elements have differing values.
   * @returns Option list, prefixed with a Mixed entry when values differ.
   */
  function selectOptions(field: AppearanceField, value: string, mixed: boolean) {
    const options = appearanceOptions(field, value);
    if (!mixed) return options;
    return [{ label: "Mixed", value: "" }, ...options.filter((option) => option.value !== "")];
  }

  /**
   * Maps an appearance field to the input extension used by InputWithBinding.
   *
   * @param field - Appearance field definition.
   * @param value - Current field value.
   * @param mixed - Whether selected elements have differing values.
   * @returns The input extension descriptor.
   */
  function inputFor(field: AppearanceField, value: string, mixed: boolean): InputExtension {
    switch (field.control) {
      case "select":
      case "visibility":
        return { kind: "select", options: selectOptions(field, value, mixed) };
      case "number":
        return { kind: "number", min: field.min, max: field.max, step: field.step };
      case "color":
        return { kind: "color", suggestions: appearanceSuggestions(field, themeCss) };
      default: {
        const suggestions = appearanceSuggestions(field, themeCss);
        return suggestions.length > 0 ? { kind: "autocomplete", suggestions } : { kind: "text" };
      }
    }
  }
</script>

{#if fields.length > 0}
  <details open class="border-t border-surface-200-800">
    <summary class="cursor-pointer select-none p-3 font-semibold opacity-80">
      Appearance
      <span class="ml-1 opacity-40">{fields.length}</span>
    </summary>
    <div class="flex flex-col gap-2 px-3 pb-3">
      {#each fields as field (field.property)}
        {@const row = styleRowFor(elements, field.property, tagValueMap, getElementById)}
        <InputWithBinding
          label={field.label}
          value={row.value}
          binding={row.binding}
          result={row.result}
          savedError={row.error}
          placeholder={row.placeholder ?? field.placeholder ?? ""}
          description={field.property}
          required={false}
          layout="column"
          input={inputFor(field, row.value, row.placeholder === "<multiple_values>")}
          {propertyKeys}
          onValueCommit={(value) => saveValue(field.property, value)}
          onBindingSave={(expression) => saveBinding(field.property, expression)}
          onBindingRemove={() => saveBinding(field.property, "")}
          onRemove={() => removeField(field.property)}
        />
      {/each}
    </div>
  </details>
{/if}
