<script lang="ts">
  import { PlusIcon, Trash2Icon } from "@lucide/svelte";
  import { commitOrRevert } from "$lib/client/util/use";
  import type { InputWithBindingRow } from "$lib/client/editor/elementBindingRows";
  import InputWithBinding from "./InputWithBinding.svelte";
  import type { ScriptPropertyKeyInfo } from "$lib/client/editor/propertyKeys";

  let {
    title,
    showHeader = true,
    rows,
    mode,
    layout = "column",
    keyPlaceholder = "property",
    valuePlaceholder = "value",
    disabled = false,
    showOverrideIndicator = false,
    onValueCommit,
    onBindingSave,
    onBindingRemove,
    onRemoveRow,
    onOverrideClear,
    onDescriptionCommit,
    onRequiredChange,
    onAdd,
    propertyKeys,
  }: {
    title?: string;
    showHeader?: boolean;
    rows: InputWithBindingRow[];
    mode: "element" | "tag" | "definition";
    layout?: "column" | "row";
    keyPlaceholder?: string;
    valuePlaceholder?: string;
    disabled?: boolean;
    showOverrideIndicator?: boolean;
    onValueCommit: (row: InputWithBindingRow, value: string) => void;
    onBindingSave?: (row: InputWithBindingRow, expression: string) => void;
    onBindingRemove?: (row: InputWithBindingRow) => void;
    onRemoveRow?: (row: InputWithBindingRow) => void;
    onOverrideClear?: (row: InputWithBindingRow) => void;
    onDescriptionCommit?: (row: InputWithBindingRow, description: string) => void;
    onRequiredChange?: (row: InputWithBindingRow, required: boolean) => void;
    onAdd?: (key: string, value: string, description: string, required: boolean) => boolean;
    propertyKeys?: Iterable<ScriptPropertyKeyInfo>;
  } = $props();

  let newKey = $state("");
  let newValue = $state("");
  let newDescription = $state("");
  let newRequired = $state(false);
  let newKeyFocus = $state("");
  let focusedField = $state<string | null>(null);
  let focusedDescription = $state<string | null>(null);

  /**
   * Validates and adds a new property row.
   */
  function addRow() {
    const key = newKey.trim();
    if (!key || !onAdd) return;
    newKeyFocus = key;
    if (!onAdd(key, newValue, newDescription, newRequired)) return;
    newKey = "";
    newValue = "";
    newDescription = "";
    newRequired = false;
  }

</script>

<div class="flex flex-col gap-2">
  {#if title && showHeader}
    <div class="flex items-center justify-between gap-2">
      <span class="font-semibold opacity-80">{title}</span>
      <span class="opacity-40">{rows.length}</span>
    </div>
  {/if}

  {#if rows.length === 0}
    <p class="opacity-50">No {title?.toLowerCase() ?? "property"} entries.</p>
  {/if}

  {#each rows as row (row.key)}
    <div class="flex flex-col gap-1">
      {#if mode === "tag"}
        <div class="flex items-center justify-between gap-2">
          <span class="text-[10px] opacity-60">{row.required ? "required" : "optional"}</span>
        </div>
      {/if}

      <InputWithBinding
        label={row.key}
        value={row.value}
        binding={row.binding}
        result={row.result}
        savedError={row.error}
        placeholder={row.placeholder ?? valuePlaceholder}
        description={row.description}
        required={row.required ?? true}
        {disabled}
        focus={row.key === newKeyFocus}
        {layout}
        input={row.input}
        {propertyKeys}
        showOverrideIndicator={mode === "tag" && showOverrideIndicator}
        overridden={row.overridden}
        onOverrideClear={
          mode === "tag" && showOverrideIndicator ? () => onOverrideClear?.(row) : undefined
        }
        onValueCommit={(value) => onValueCommit(row, value)}
        onBindingSave={mode === "element" && onBindingSave
          ? (expression) => onBindingSave?.(row, expression)
          : undefined}
        onBindingRemove={mode === "element" && onBindingRemove
          ? () => onBindingRemove?.(row)
          : undefined}
        onRemove={mode === "element" && onRemoveRow ? () => onRemoveRow?.(row) : undefined}
        onMounted={() => (newKeyFocus = "")}
      />

      {#if mode === "tag" && row.description}
        <p class="text-[10px] opacity-60" title={row.description}>{row.description}</p>
      {/if}

      {#if mode === "definition"}
        <div class="flex items-center justify-between gap-2">
          <label class="flex items-center gap-1 text-xs opacity-70">
            <input
              type="checkbox"
              class="checkbox"
              checked={row.required}
              {disabled}
              onchange={(event) => onRequiredChange?.(row, event.currentTarget.checked)}
            />
            required
          </label>
          {#if onRemoveRow}
            <button
              type="button"
              class="btn-icon btn-sm preset-tonal"
              aria-label={`Remove ${row.key}`}
              disabled={disabled || row.required || row.locked}
              title={row.locked
                ? `Defined by UDT definition — ${row.key}`
                : row.description
                  ? `${row.description} — remove ${row.key}`
                  : `Remove ${row.key}`}
              onclick={() => onRemoveRow?.(row)}
            >
              <Trash2Icon class="size-3.5" />
            </button>
          {/if}
        </div>
        {#if onDescriptionCommit}
          <input
            class="h-7 min-w-0 py-0 px-2 hover:outline hover:outline-1 hover:outline-surface-400-600"
            class:input={focusedDescription === row.key}
            class:bg-inherit={focusedDescription !== row.key}
            class:border-transparent={focusedDescription !== row.key}
            value={row.description ?? ""}
            placeholder="description (shown as tooltip)"
            {disabled}
            onfocus={() => (focusedDescription = row.key)}
            onblur={() => (focusedDescription = null)}
            {@attach commitOrRevert((description) => onDescriptionCommit?.(row, description))}
          />
        {/if}
      {/if}
    </div>
  {/each}

  {#if onAdd && mode !== "tag"}
    <div class="flex flex-col gap-1">
      <div class="flex gap-1">
        <input
          class="h-7 min-w-0 flex-1 py-0 px-2 hover:outline hover:outline-1 hover:outline-surface-400-600"
          class:input={focusedField === "newKey"}
          class:bg-inherit={focusedField !== "newKey"}
          class:border-transparent={focusedField !== "newKey"}
          bind:value={newKey}
          placeholder={keyPlaceholder}
          {disabled}
          onfocus={() => (focusedField = "newKey")}
          onblur={() => (focusedField = null)}
          {@attach commitOrRevert(() => addRow(), "string", undefined, { commitOnBlur: false })}
        />
        {#if mode === "definition"}
          <input
            class="h-7 min-w-0 flex-1 py-0 px-2 hover:outline hover:outline-1 hover:outline-surface-400-600"
            class:input={focusedField === "newValue"}
            class:bg-inherit={focusedField !== "newValue"}
            class:border-transparent={focusedField !== "newValue"}
            bind:value={newValue}
            placeholder={valuePlaceholder}
            {disabled}
            onfocus={() => (focusedField = "newValue")}
            onblur={() => (focusedField = null)}
            {@attach commitOrRevert(() => addRow(), "string", undefined, { commitOnBlur: false })}
          />
        {/if}
        <button
          type="button"
          class="btn btn-sm preset-tonal shrink-0"
          onclick={addRow}
          disabled={disabled || !newKey.trim()}
        >
          <PlusIcon class="size-3.5" />
          Add
        </button>
      </div>
      {#if mode === "definition"}
        <input
          class="h-7 min-w-0 py-0 px-2 hover:outline hover:outline-1 hover:outline-surface-400-600"
          class:input={focusedField === "newDescription"}
          class:bg-inherit={focusedField !== "newDescription"}
          class:border-transparent={focusedField !== "newDescription"}
          bind:value={newDescription}
          placeholder="description"
          {disabled}
          onfocus={() => (focusedField = "newDescription")}
          onblur={() => (focusedField = null)}
          {@attach commitOrRevert(() => addRow(), "string", undefined, { commitOnBlur: false })}
        />
        <label class="flex items-center gap-1 text-xs opacity-70">
          <input type="checkbox" class="checkbox" bind:checked={newRequired} {disabled} />
          required
        </label>
      {/if}
    </div>
  {/if}
</div>
