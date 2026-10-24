<script lang="ts">
  import { PlusIcon } from "@lucide/svelte";
  import type { ElementBindingRowData } from "$lib/client/editor/elementBindingRows";
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
  let newValue = $state("");

  function addRow() {
    const key = newKey.trim();
    if (!key) return;
    if (!onAdd(key, newValue)) return;
    newKey = "";
    newValue = "";
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
      removable
      onValueCommit={(value) => onValueCommit(row, value)}
      onBindingSave={(expression) => onBindingSave(row, expression)}
      onBindingRemove={() => onBindingRemove(row)}
      onRemove={() => onRemoveRow(row)}
    />
  {/each}

  <div class="flex items-center gap-1">
    <input
      class="input h-7 min-w-0 flex-1 py-0 px-2"
      bind:value={newKey}
      placeholder={keyPlaceholder}
    />
    <input
      class="input h-7 min-w-0 flex-1 py-0 px-2"
      bind:value={newValue}
      placeholder={valuePlaceholder}
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
