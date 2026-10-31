<script lang="ts">
  import { Trash2Icon } from "@lucide/svelte";
  import BindingEditor from "./BindingEditor.svelte";

  let {
    label,
    value,
    binding,
    result,
    multiline = false,
    removable = false,
    onValueCommit,
    onBindingSave,
    onBindingRemove,
    onRemove,
  }: {
    label: string;
    value: string;
    binding: string;
    result: string;
    multiline?: boolean;
    removable?: boolean;
    onValueCommit: (value: string) => void;
    onBindingSave: (expression: string) => void;
    onBindingRemove: () => void;
    onRemove?: () => void;
  } = $props();

  let isBound = $derived(binding.trim().length > 0);
  let displayedValue = $derived(isBound ? result : value);
</script>

<div class="flex flex-col gap-1">
  <div class="flex items-center justify-between gap-2">
    <span class="opacity-60 truncate">{label}</span>
  </div>

  <div class="flex items-stretch gap-1 min-w-0">
    {#if multiline}
      <textarea
        class="input flex-1 min-w-0 py-1 px-2"
        rows="2"
        value={displayedValue}
        disabled={isBound}
        placeholder={isBound ? "No result" : ""}
        onblur={(event) => {
          if (!isBound) onValueCommit(event.currentTarget.value);
        }}></textarea>
    {:else}
      <input
        class="input h-7 flex-1 min-w-0 py-0 px-2"
        value={displayedValue}
        disabled={isBound}
        placeholder={isBound ? "No result" : ""}
        onblur={(event) => {
          if (!isBound) onValueCommit(event.currentTarget.value);
        }}
      />
    {/if}

    <BindingEditor {label} {binding} scope="element" {onBindingSave} {onBindingRemove} />

    {#if removable && onRemove}
      <button
        type="button"
        class="btn-icon btn-sm preset-tonal"
        title={`Remove ${label}`}
        onclick={onRemove}
      >
        <Trash2Icon class="size-3.5" />
      </button>
    {/if}
  </div>
</div>
