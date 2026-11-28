<script lang="ts">
  import { Trash2Icon } from "@lucide/svelte";
  import BindingEditor from "./BindingEditor.svelte";
  import { commitOrRevert, focusOnMount } from "$lib/client/util/use";
  import { boundStyle, boundTooltip } from "$lib/client/util/bindingStyle";
  import type { InputExtension } from "$lib/client/editor/elementBindingRows";
  import { toHexColor } from "$lib/client/editor/elementAppearance";
  import type { ScriptPropertyKeyInfo } from "$lib/client/editor/propertyKeys";
  import { onMount } from "svelte";

  let {
    label,
    value,
    binding = "",
    result = "",
    savedError = null,
    placeholder = "",
    description,
    required = true,
    disabled = false,
    multiline = false,
    focus = false /** focus and select text when row is mounted*/,
    layout = "column",
    input = { kind: "text" } as InputExtension,
    suffix,
    showOverrideIndicator = false,
    overridden = false,
    onOverrideClear,
    bindingScope = "element",
    bindingContextDescription = "tag(), tagValue(), tagStatus(), element, and getElementById()",
    onValueCommit,
    onBindingSave,
    onBindingRemove,
    onRemove,
    onMounted,
    propertyKeys,
  }: {
    label: string;
    value: string;
    binding?: string;
    result?: string;
    savedError?: string | null;
    placeholder?: string;
    description?: string;
    required?: boolean;
    disabled?: boolean;
    multiline?: boolean;
    focus?: boolean;
    layout?: "column" | "row";
    input?: InputExtension;
    suffix?: string;
    showOverrideIndicator?: boolean;
    overridden?: boolean;
    onOverrideClear?: () => void;
    bindingScope?: "element" | "tag";
    bindingContextDescription?: string;
    onValueCommit: (value: string) => void | boolean;
    onBindingSave?: (expression: string) => void;
    onBindingRemove?: () => void;
    onRemove?: () => void;
    onMounted?: () => void;
    propertyKeys?: Iterable<ScriptPropertyKeyInfo>;
  } = $props();

  const datalistId = $props.id();

  let isBound = $derived(binding.trim().length > 0);
  let removable = $derived(!required);
  let showBinding = $derived(Boolean(onBindingSave && onBindingRemove));
  let displayedValue = $derived(isBound ? result : value);
  let focused = $state(false);

  let datalistSuggestions = $derived.by(() => {
    if (input.kind === "autocomplete" || input.kind === "color") return input.suggestions ?? [];
    return [];
  });

  onMount(() => onMounted?.());

  /**
   * Toggles the active input styling when focus changes.
   *
   * @param next - Whether the input is focused.
   */
  function setFocused(next: boolean) {
    focused = next;
  }

  /**
   * Sets the native checkbox indeterminate state.
   *
   * @param node - Checkbox input to update.
   * @param value - Whether the checkbox is indeterminate.
   * @returns Action with an update method for reactive changes.
   */
  function indeterminate(node: HTMLInputElement, value: boolean) {
    node.indeterminate = value;
    return {
      /**
       * Updates the native indeterminate state.
       *
       * @param next - Whether the checkbox is indeterminate.
       */
      update(next: boolean) {
        node.indeterminate = next;
      },
    };
  }
</script>

{#snippet overrideIndicator()}
  {#if overridden && onOverrideClear}
    <button
      type="button"
      class="size-4 shrink-0 self-center rounded-full bg-primary-500"
      title="Instance override - click to remove"
      onclick={onOverrideClear}
    ></button>
  {:else}
    <div
      class="size-4 shrink-0 self-center rounded-full bg-surface-200-800 border-1 border-surface-400-600"
      title="Value inherited"
    ></div>
  {/if}
{/snippet}

{#if input.kind === "checkbox"}
  <div class="flex items-center justify-between gap-2">
    <span class="min-w-0 truncate opacity-60" title={description}>{label}</span>
    <div class="flex items-center gap-2">
      <input
        type="checkbox"
        class="checkbox"
        title={isBound ? boundTooltip : ""}
        style={boundStyle(isBound)}
        use:indeterminate={Boolean(input.indeterminate) && !isBound}
        checked={isBound ? displayedValue === "true" : value === "true"}
        {disabled}
        onchange={(event) => onValueCommit(event.currentTarget.checked ? "true" : "false")}
      />
      {#if showOverrideIndicator}
        {@render overrideIndicator()}
      {/if}
      {#if showBinding}
        <BindingEditor
          {label}
          {binding}
          {savedError}
          scope={bindingScope}
          contextDescription={bindingContextDescription}
          {propertyKeys}
          onBindingSave={onBindingSave!}
          onBindingRemove={onBindingRemove!}
        />
      {/if}
    </div>
  </div>
{:else}
  <div class={layout === "row" ? "flex items-center gap-2" : "flex flex-col gap-1"}>
    <div class={layout === "row" ? "w-28 shrink-0" : "flex items-center justify-between gap-2"}>
      <span class="block truncate opacity-60" title={description}>{label}</span>
    </div>

    <div class="flex min-w-0 items-stretch gap-1 {layout === 'row' ? 'flex-1' : ''}">
      {#if input.kind === "select"}
        <select
          class="h-7 min-w-0 flex-1 py-0 px-2 hover:outline-1 hover:outline-surface-400-600 rounded-base"
          class:input={focused}
          class:bg-inherit={!focused}
          class:border-transparent={!focused}
          value={displayedValue}
          {disabled}
          title={isBound ? boundTooltip : ""}
          style={boundStyle(isBound)}
          onfocus={() => setFocused(true)}
          onblur={() => setFocused(false)}
          onchange={(event) => onValueCommit(event.currentTarget.value)}
        >
          {#each input.options as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      {:else if multiline}
        <textarea
          class="min-w-0 flex-1 resize-y py-1 px-2 hover:outline-1 hover:outline-surface-400-600 rounded-base"
          class:input={focused}
          class:bg-inherit={!focused}
          class:border-transparent={!focused}
          rows="2"
          value={displayedValue}
          {disabled}
          title={isBound ? boundTooltip : ""}
          style={boundStyle(isBound)}
          use:focusOnMount={!focus}
          placeholder={isBound ? "No result" : placeholder}
          onfocus={() => setFocused(true)}
          onblur={(event) => {
            setFocused(false);
            if (!isBound) onValueCommit(event.currentTarget.value);
          }}></textarea>
      {:else}
        <div class="flex min-w-0 flex-1 items-stretch gap-1">
          <input
            class="h-7 min-w-0 flex-1 py-0 px-2 placeholder:opacity-50 hover:outline-1 hover:outline-surface-400-600 rounded-base"
            class:input={focused}
            class:bg-inherit={!focused}
            class:border-transparent={!focused}
            type={input.kind === "number" ? "number" : "text"}
            value={displayedValue}
            list={datalistSuggestions.length > 0 ? datalistId : undefined}
            min={input.kind === "number" ? input.min : undefined}
            max={input.kind === "number" ? input.max : undefined}
            step={input.kind === "number" ? input.step : undefined}
            {disabled}
            placeholder={isBound ? "No result" : placeholder}
            title={isBound ? boundTooltip : ""}
            style={boundStyle(isBound)}
            use:focusOnMount={!focus}
            onfocus={() => setFocused(true)}
            onblur={() => setFocused(false)}
            {@attach commitOrRevert((next) => onValueCommit(next))}
          />

          {#if input.kind === "color"}
            <input
              class="h-7 w-8 shrink-0 cursor-pointer rounded border border-surface-300-700 bg-transparent p-0"
              type="color"
              value={toHexColor(displayedValue)}
              {disabled}
              title="Pick color"
              onchange={(event) => onValueCommit(event.currentTarget.value)}
            />
          {/if}

          {#if datalistSuggestions.length > 0}
            <datalist id={datalistId}>
              {#each datalistSuggestions as suggestion (suggestion)}
                <option value={suggestion}></option>
              {/each}
            </datalist>
          {/if}
        </div>
      {/if}

      {#if suffix}
        <span class="shrink-0 self-center text-xs opacity-60">{suffix}</span>
      {/if}

      {#if showOverrideIndicator}
        {@render overrideIndicator()}
      {/if}

      {#if showBinding}
        <BindingEditor
          {label}
          {binding}
          {savedError}
          scope={bindingScope}
          contextDescription={bindingContextDescription}
          {propertyKeys}
          onBindingSave={onBindingSave!}
          onBindingRemove={onBindingRemove!}
        />
      {/if}

      {#if removable && onRemove}
        <button
          type="button"
          class="btn-icon btn-sm hover:bg-surface-400-600"
          {disabled}
          title={description ? `${description} — remove ${label}` : `Remove ${label}`}
          onclick={onRemove}
        >
          <Trash2Icon class="size-3.5 opacity-60" />
        </button>
      {/if}
    </div>
  </div>
{/if}
