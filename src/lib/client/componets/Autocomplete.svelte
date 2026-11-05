<script lang="ts">
  import { filterAutocompleteItems } from "$lib/client/util/autocomplete";

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
    showFirstMatchButton?: boolean;
    firstMatchButtonTitle?: string;
    value?: string;
    onSelect: (item: string) => void;
  } = $props();

  let open = $state(false);
  let suggestions = $derived(filterAutocompleteItems(items, value, limit));
  let suggestionText = $derived.by(() => {
    const pos = suggestions[0].indexOf(value);
    if (pos === 0) return suggestions[0].substring(value.length);
    return null;
  });

  function select(item: string | undefined) {
    if (!item) return;
    onSelect(item);
    value = "";
    open = false;
  }

  function closeIfFocusLeft(event: FocusEvent & { currentTarget: HTMLDivElement }) {
    const next = event.relatedTarget;
    if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
      open = false;
    }
  }
</script>

<div class="relative" onfocusout={closeIfFocusLeft}>
  <div class="flex items-center gap-1">
    <input
      class="input text-[1rem] placeholder:opacity-50 h-7 min-w-0 flex-1 py-0 px-2"
      type="search"
      bind:value
      {placeholder}
      {disabled}
      onfocus={() => (open = true)}
      oninput={() => (open = true)}
      onkeydown={(event) => {
        if (event.key === "Enter" && suggestions[0]) {
          event.preventDefault();
          select(suggestions[0]);
        }
        if (event.key === "Escape") open = false;
      }}
    />
    {#if value.length > 0 && suggestionText}
      <span class="absolute text-[1rem] px-2 bottom-0 opacity-50" style={`left: ${value.length}ch`}>
        {suggestionText}
      </span>
    {/if}
  </div>

  {#if open && suggestions.length > 0}
    <div
      class="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded border border-surface-300-700 bg-surface-100-900 p-1 shadow-xl"
      role="listbox"
    >
      {#each suggestions as item (item)}
        <button
          type="button"
          class="block w-full truncate rounded px-2 py-1 text-left hover:bg-surface-200-800"
          role="option"
          aria-selected="false"
          onmousedown={(event) => event.preventDefault()}
          onclick={() => select(item)}
        >
          {item}
        </button>
      {/each}
    </div>
  {/if}
</div>
