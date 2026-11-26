<script lang="ts">
  import { Trash2Icon } from "@lucide/svelte";
  import BindingEditor from "./BindingEditor.svelte";
  import { commitOrRevert, focusOnMount } from "$lib/client/util/use";
  import { fieldStyle } from "$lib/client/util/bindingStyle";
  import type { ElementBindingRowControl } from "$lib/client/editor/elementBindingRows";
  import { onMount, type Snippet } from "svelte";

  let {
    label,
    value,
    binding,
    result,
    savedError = null,
    placeholder = "",
    description,
    required = true,
    multiline = false,
    focus = false /** focus and select text when row is mounted*/,
    onValueCommit,
    onBindingSave,
    onBindingRemove,
    onRemove,
    onMounted,
    control,
    controlContext,
  }: {
    label: string;
    value: string;
    binding: string;
    result: string;
    savedError?: string | null;
    placeholder?: string;
    description?: string;
    required?: boolean;
    multiline?: boolean;
    focus?: boolean;
    onValueCommit: (value: string) => void;
    onBindingSave: (expression: string) => void;
    onBindingRemove: () => void;
    onRemove?: () => void;
    onMounted?: () => void;
    control?: Snippet<[ElementBindingRowControl]>;
    controlContext?: unknown;
  } = $props();

  let isBound = $derived(binding.trim().length > 0);
  let removable = $derived(!required);
  let displayedValue = $derived(isBound ? result : value);

  onMount(() => onMounted?.());
</script>

<div class="flex flex-col gap-1">
  <div class="flex items-center justify-between gap-2">
    <span class="opacity-60 truncate" title={description}>{label}</span>
  </div>

  <div class="flex items-stretch gap-1 min-w-0">
    {#if control}
      {@render control({
        value: displayedValue,
        disabled: isBound,
        bound: isBound,
        placeholder: isBound ? "No result" : placeholder,
        commit: onValueCommit,
        context: controlContext,
      })}
    {:else if multiline}
      <textarea
        class="input placeholder:opacity-50 flex-1 min-w-0 py-1 px-2"
        rows="2"
        value={displayedValue}
        disabled={isBound}
        style={fieldStyle({ bound: isBound })}
        use:focusOnMount={!focus}
        placeholder={isBound ? "No result" : placeholder}
        onblur={(event) => {
          if (!isBound) onValueCommit(event.currentTarget.value);
        }}></textarea>
    {:else}
      <input
        class="input placeholder:opacity-50 h-7 flex-1 min-w-0 py-0 px-2"
        value={displayedValue}
        disabled={isBound}
        placeholder={isBound ? "No result" : placeholder}
        style={fieldStyle({ bound: isBound })}
        use:focusOnMount={!focus}
        {@attach commitOrRevert((value) => onValueCommit(value))}
      />
    {/if}

    <BindingEditor
      {label}
      {binding}
      {savedError}
      scope="element"
      {onBindingSave}
      {onBindingRemove}
    />

    {#if removable && onRemove}
      <button
        type="button"
        class="btn-icon btn-sm preset-tonal"
        title={description ? `${description} — remove ${label}` : `Remove ${label}`}
        onclick={onRemove}
      >
        <Trash2Icon class="size-3.5" />
      </button>
    {/if}
  </div>
</div>
