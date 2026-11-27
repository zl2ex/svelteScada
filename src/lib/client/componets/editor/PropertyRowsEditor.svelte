<script lang="ts">
  import { PlusIcon, Trash2Icon } from "@lucide/svelte";
  import { commitOrRevert } from "$lib/client/util/use";

  export type PropertyRowsMode = "definition" | "view";

  export type PropertyRow = {
    key: string;
    value: string;
    description?: string;
    required: boolean;
    locked?: boolean;
    placeholder?: string;
    overridden?: boolean;
  };

  let {
    rows,
    title = "Properties",
    mode = "definition",
    keyPlaceholder = "property",
    valuePlaceholder = "value",
    disabled = false,
    onValueCommit,
    onDescriptionCommit,
    onRequiredChange,
    onRemove,
    onAdd,
    onOverrideClear,
  }: {
    rows: PropertyRow[];
    title?: string;
    mode?: PropertyRowsMode;
    keyPlaceholder?: string;
    valuePlaceholder?: string;
    disabled?: boolean;
    onValueCommit: (key: string, value: string) => void;
    onDescriptionCommit?: (key: string, description: string) => void;
    onRequiredChange?: (key: string, required: boolean) => void;
    onRemove?: (key: string) => void;
    onAdd?: (key: string, value: string, description: string, required: boolean) => boolean;
    onOverrideClear?: (key: string) => void;
  } = $props();

  let newKey = $state("");
  let newValue = $state("");
  let newDescription = $state("");
  let newRequired = $state(false);

  /**
   * Validates and adds a new property row, then clears the draft inputs.
   */
  function addRow() {
    const key = newKey.trim();
    if (!key || !onAdd) return;
    if (!onAdd(key, newValue, newDescription, newRequired)) return;
    newKey = "";
    newValue = "";
    newDescription = "";
    newRequired = false;
  }
</script>

<div class="flex flex-col gap-2">
  {#if rows.length === 0}
    <p class="opacity-50">No {title.toLowerCase()}.</p>
  {/if}

  {#each rows as row (row.key)}
    <div class="flex flex-col gap-1 rounded border border-surface-200-800 p-1.5">
      <div class="flex items-center justify-between gap-2">
        <span class="truncate opacity-60 text-sm" title={row.description}>{row.key}</span>
        <div class="flex items-center gap-2">
          {#if onOverrideClear}
            {#if row.overridden}
              <button
                type="button"
                class="size-4 shrink-0 rounded-full bg-primary-500"
                title="Instance override - click to remove"
                onclick={() => onOverrideClear(row.key)}
              ></button>
            {:else}
              <div
                class="size-4 shrink-0 rounded-full bg-surface-200-800 border-1 border-surface-400-600"
                title="Value inherited"
              ></div>
            {/if}
          {/if}
          {#if mode === "definition"}
            <label class="flex items-center gap-1 text-xs opacity-70">
              <input
                type="checkbox"
                class="checkbox"
                checked={row.required}
                {disabled}
                onchange={(event) => onRequiredChange?.(row.key, event.currentTarget.checked)}
              />
              required
            </label>
            {#if onRemove}
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
                onclick={() => onRemove(row.key)}
              >
                <Trash2Icon class="size-3.5" />
              </button>
            {/if}
          {:else}
            <span class="text-[10px] opacity-60">{row.required ? "required" : "optional"}</span>
          {/if}
        </div>
      </div>
      {#if mode === "view" && row.description}
        <p class="text-[10px] opacity-60" title={row.description}>{row.description}</p>
      {/if}
      <div class="flex items-center gap-1">
        <input
          class="input h-7 min-w-0 flex-1 py-0 px-2"
          value={row.value}
          placeholder={row.placeholder ?? valuePlaceholder}
          {disabled}
          {@attach commitOrRevert((value) => onValueCommit(row.key, value))}
        />
      </div>
      {#if mode === "definition"}
        {#if onDescriptionCommit}
          <input
            class="input h-7 min-w-0 py-0 px-2"
            value={row.description ?? ""}
            placeholder="description (shown as tooltip)"
            {disabled}
            {@attach commitOrRevert((value) => onDescriptionCommit(row.key, value))}
          />
        {/if}
      {/if}
    </div>
  {/each}

  {#if mode === "definition" && onAdd}
    <div class="flex flex-col gap-1 rounded border border-surface-300-700 p-1.5">
      <div class="flex gap-1">
        <input
          class="input h-7 min-w-0 flex-1 py-0 px-2"
          bind:value={newKey}
          placeholder={keyPlaceholder}
          {disabled}
          {@attach commitOrRevert(() => addRow(), "string", undefined, { commitOnBlur: false })}
        />
        <input
          class="input h-7 min-w-0 flex-1 py-0 px-2"
          bind:value={newValue}
          placeholder={valuePlaceholder}
          {disabled}
          {@attach commitOrRevert(() => addRow(), "string", undefined, { commitOnBlur: false })}
        />
      </div>
      <input
        class="input h-7 min-w-0 py-0 px-2"
        bind:value={newDescription}
        placeholder="description"
        {disabled}
        {@attach commitOrRevert(() => addRow(), "string", undefined, { commitOnBlur: false })}
      />
      <div class="flex items-center justify-between">
        <label class="flex items-center gap-1 text-xs opacity-70">
          <input type="checkbox" class="checkbox" bind:checked={newRequired} {disabled} />
          required
        </label>
        <button
          type="button"
          class="btn btn-sm preset-tonal"
          onclick={addRow}
          disabled={disabled || !newKey.trim()}
        >
          <PlusIcon class="size-3.5" /> Add
        </button>
      </div>
    </div>
  {/if}
</div>
