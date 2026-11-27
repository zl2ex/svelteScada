<script lang="ts">
  import {
    filterAutocompleteItems,
    findExactAutocompleteItem,
  } from "$lib/client/util/autocomplete";

  let {
    items,
    placeholder = "Search…",
    limit = 12,
    disabled = false,
    value = $bindable(""),
    onSelect,
  }: {
    items: string[];
    placeholder?: string;
    limit?: number;
    disabled?: boolean;
    value?: string;
    onSelect: (item: string) => void;
  } = $props();

  const datalistId = $props.id();
  let filteredItems = $state<string[]>([]);

  $effect(() => {
    filteredItems = filterAutocompleteItems(items, value, limit);
  });

  let suggestionText = $derived.by(() => {
    const first = filteredItems[0];
    if (!first || value.length === 0) return null;
    return first.toLowerCase().startsWith(value.toLowerCase())
      ? first.substring(value.length)
      : null;
  });

  /**
   * Selects an item when the typed value exactly matches one, then clears input.
   *
   * @param event - change event whose target holds the typed value
   */
  function handleChange(event: Event & { currentTarget: HTMLInputElement }) {
    const item = findExactAutocompleteItem(items, event.currentTarget.value);
    if (!item) return;

    onSelect(item);
    value = "";
  }
</script>

<div class="relative">
  <div class="flex items-center gap-1">
    <input
      class="input text-[1rem] placeholder:opacity-50 h-7 min-w-0 flex-1 py-0 px-2"
      type="search"
      bind:value
      list={datalistId}
      {placeholder}
      {disabled}
      onchange={handleChange}
      onkeydown={(ev) => {
        if (ev.key === "Enter") {
          const v = findExactAutocompleteItem(items, filteredItems[0]);
          if (!v) return;
          onSelect(v);
          value = "";
        }
      }}
    />
    {#if suggestionText}
      <span class="absolute text-[1rem] px-2 bottom-0 opacity-50" style={`left: ${value.length}ch`}>
        {suggestionText}
      </span>
    {/if}
  </div>

  <datalist id={datalistId}>
    {#each filteredItems as item (item)}
      <option value={item}></option>
    {/each}
  </datalist>
</div>
