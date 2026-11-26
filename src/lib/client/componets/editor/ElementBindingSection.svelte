<script lang="ts">
  import { PlusIcon } from "@lucide/svelte";
  import type { ElementBindingRowData } from "$lib/client/editor/elementBindingRows";
  import { commitOrRevert } from "$lib/client/util/use";
  import ElementBindingRow from "./ElementBindingRow.svelte";

  let {
    title,
    rows,
    keyPlaceholder,
    valuePlaceholder,
    onAdd,
    onValueCommit,
    onBindingSave,
    onBindingRemove,
    onRemoveRow,
  }: {
    title: string;
    rows: ElementBindingRowData[];
    keyPlaceholder: string;
    valuePlaceholder: string;
    onAdd: (key: string, value: string) => boolean;
    onValueCommit: (row: ElementBindingRowData, value: string) => void;
    onBindingSave: (row: ElementBindingRowData, expression: string) => void;
    onBindingRemove: (row: ElementBindingRowData) => void;
    onRemoveRow: (row: ElementBindingRowData) => void;
  } = $props();

  let newKey = $state("");
  let newKeyFocus = $state(""); /** focus input for new bindingRow when added */

  function addRow() {
    const key = newKey.trim();
    newKeyFocus = key;
    if (!key) return;
    if (!onAdd(key, "")) return;
    newKey = "";
  }
</script>

<div class="flex flex-col gap-2">
  <div class="flex items-center justify-between gap-2">
    <span class="font-semibold opacity-80">{title}</span>
    <span class="opacity-40">{rows.length}</span>
  </div>

  {#if rows.length === 0}
    <p class="opacity-50">No {title.toLowerCase()} values.</p>
  {/if}

  {#each rows as row (row.key)}
    <ElementBindingRow
      label={row.key}
      value={row.value}
      binding={row.binding}
      result={row.result}
      savedError={row.error}
      placeholder={row.placeholder}
      description={row.description}
      required={row.required}
      focus={row.key === newKeyFocus}
      onValueCommit={(value) => onValueCommit(row, value)}
      onBindingSave={(expression) => onBindingSave(row, expression)}
      onBindingRemove={() => onBindingRemove(row)}
      onRemove={() => onRemoveRow(row)}
      onMounted={() => (newKeyFocus = "")}
    />
  {/each}

  <div class="flex items-center gap-1">
    <input
      class="input placeholder:opacity-50 h-7 min-w-0 flex-1 py-0 px-2"
      bind:value={newKey}
      placeholder={keyPlaceholder}
      {@attach commitOrRevert(() => addRow(), "string", undefined, { commitOnBlur: false })}
    />
    <button
      type="button"
      class="btn btn-sm preset-tonal shrink-0"
      onclick={addRow}
      disabled={!newKey.trim()}
    >
      <PlusIcon class="size-3.5" />
      Add
    </button>
  </div>
</div>
