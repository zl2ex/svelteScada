<script lang="ts">
  import { getEditorContext } from "$lib/client/editor/editorContext";
  import { getTagValueMapContext } from "$lib/client/live/tagMapContext";
  import { commitOrRevert } from "$lib/client/util/use";
  import {
    removeStyleRow,
    setBinding,
    setStyleProperty,
    type ElementBindingRowControl,
  } from "$lib/client/editor/elementBindingRows";
  import { styleRowFor, updateElements } from "$lib/client/editor/elementSelectionRows";
  import {
    appearanceFieldsFor,
    appearanceOptions,
    appearanceSuggestions,
    toHexColor,
    type AppearanceField,
  } from "$lib/client/editor/elementAppearance";
  import type { ElementRecord } from "$lib/elements/elementTypes";
  import ElementBindingRow from "./ElementBindingRow.svelte";
  import { fieldStyle } from "$lib/client/util/bindingStyle";

  let { elements }: { elements: ElementRecord[] } = $props();

  const editor = getEditorContext();
  const tagValueMap = getTagValueMapContext();

  let fields = $derived(appearanceFieldsFor(elements));
  let themeCss = $derived(editor.activeTheme?.projectStyle ?? "");

  function saveValue(property: string, raw: string) {
    updateElements(editor.elementsCollection, elements, (element) => ({
      style: setStyleProperty(element, property, raw === "" ? null : raw),
    }));
  }

  function saveBinding(property: string, expression: string) {
    updateElements(editor.elementsCollection, elements, (element) => ({
      bindings: setBinding(element, "style", property, expression),
    }));
  }

  function removeField(property: string) {
    updateElements(editor.elementsCollection, elements, (element) =>
      removeStyleRow(element, property),
    );
  }

  function selectOptions(field: AppearanceField, value: string, mixed: boolean) {
    const options = appearanceOptions(field, value);
    if (!mixed) return options;
    return [{ label: "Mixed", value: "" }, ...options.filter((option) => option.value !== "")];
  }
</script>

{#snippet appearanceControl(props: ElementBindingRowControl)}
  {@const field = props.context as AppearanceField}
  {#if field.control === "select" || field.control === "visibility"}
    <select
      class="input h-7 min-w-0 flex-1 py-0 px-2"
      value={props.value}
      disabled={props.disabled}
      style={fieldStyle({ bound: props.bound })}
      onchange={(event) => props.commit(event.currentTarget.value)}
    >
      {#each selectOptions(field, props.value, props.placeholder === "<multiple_values>") as option (option.value)}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
  {:else if field.control === "number"}
    <input
      class="input placeholder:opacity-50 h-7 min-w-0 flex-1 py-0 px-2"
      type="number"
      value={props.value}
      min={field.min}
      max={field.max}
      step={field.step}
      style={fieldStyle({ bound: props.bound })}
      placeholder={props.placeholder}
      disabled={props.disabled}
      {@attach commitOrRevert((value) => props.commit(value))}
    />
  {:else if field.control === "color"}
    <div class="flex min-w-0 flex-1 items-stretch gap-1">
      <input
        class="input placeholder:opacity-50 h-7 min-w-0 flex-1 py-0 px-2"
        value={props.value}
        list={`appearance-${field.property}`}
        style={fieldStyle({ bound: props.bound })}
        placeholder={props.placeholder}
        disabled={props.disabled}
        {@attach commitOrRevert((value) => props.commit(value))}
      />
      <input
        class="h-7 w-8 shrink-0 cursor-pointer rounded border border-surface-300-700 bg-transparent p-0"
        type="color"
        value={toHexColor(props.value)}
        disabled={props.disabled}
        title="Pick color"
        onchange={(event) => props.commit(event.currentTarget.value)}
      />
      <datalist id={`appearance-${field.property}`}>
        {#each appearanceSuggestions(field, themeCss) as suggestion (suggestion)}
          <option value={suggestion}></option>
        {/each}
      </datalist>
    </div>
  {:else}
    <input
      class="input placeholder:opacity-50 h-7 min-w-0 flex-1 py-0 px-2"
      value={props.value}
      list={`appearance-${field.property}`}
      style={fieldStyle({ bound: props.bound })}
      placeholder={props.placeholder}
      disabled={props.disabled}
      {@attach commitOrRevert((value) => props.commit(value))}
    />
    <datalist id={`appearance-${field.property}`}>
      {#each appearanceSuggestions(field, themeCss) as suggestion (suggestion)}
        <option value={suggestion}></option>
      {/each}
    </datalist>
  {/if}
{/snippet}

{#if fields.length > 0}
  <details open class="border-t border-surface-200-800">
    <summary class="cursor-pointer select-none p-3 font-semibold opacity-80">
      Appearance
      <span class="ml-1 opacity-40">{fields.length}</span>
    </summary>
    <div class="flex flex-col gap-2 px-3 pb-3">
      {#each fields as field (field.property)}
        {@const row = styleRowFor(elements, field.property, tagValueMap)}
        <ElementBindingRow
          label={field.label}
          value={row.value}
          binding={row.binding}
          result={row.result}
          savedError={row.error}
          placeholder={row.placeholder ?? field.placeholder ?? ""}
          required={false}
          control={appearanceControl}
          controlContext={field}
          onValueCommit={(value) => saveValue(field.property, value)}
          onBindingSave={(expression) => saveBinding(field.property, expression)}
          onBindingRemove={() => saveBinding(field.property, "")}
          onRemove={() => removeField(field.property)}
        />
      {/each}
    </div>
  </details>
{/if}
