<script lang="ts">
  import { BracesIcon, Trash2Icon, Unlink2Icon } from "@lucide/svelte";
  import { Popover, Portal } from "@skeletonlabs/skeleton-svelte";
  import ScriptEditor from "./ScriptEditor.svelte";

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

  let draftBinding = $state("");
  let lastBinding: string | null = null;
  let isBound = $derived(binding.trim().length > 0);
  let displayedValue = $derived(isBound ? result : value);

  $effect(() => {
    if (binding === lastBinding) return;

    lastBinding = binding;
    draftBinding = binding;
  });

  function saveBinding() {
    onBindingSave(draftBinding.trim());
  }
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

    <Popover>
      <Popover.Trigger
        type="button"
        class="btn btn-sm {isBound ? 'preset-filled' : 'preset-tonal'} shrink-0"
        title={isBound ? binding : "Add binding"}
      >
        <BracesIcon class="size-4" />
      </Popover.Trigger>

      <Portal>
        <Popover.Positioner>
          <Popover.Content class="bg-surface-100-900 rounded-lg p-2">
            <div class="flex flex-col gap-2 p-1">
              <div class="flex items-center justify-between gap-2">
                <span class="font-semibold truncate">{label} binding</span>
                {#if isBound}
                  <Popover.CloseTrigger class="btn btn-sm preset-tonal" onclick={onBindingRemove}>
                    <Unlink2Icon class="size-3.5" />
                    Remove
                  </Popover.CloseTrigger>
                {/if}
              </div>

              <p class="opacity-50">
                Expressions receive <code>tag()</code>
                ,
                <code>tagStatus()</code>
                ,
                <code>props</code>
                , and
                <code>element</code>
                .
              </p>

              <ScriptEditor
                value={draftBinding}
                height="300px"
                ariaLabel={`${label} binding expression`}
                onchange={(next) => (draftBinding = next)}
              />

              <div class="flex justify-end gap-2">
                <Popover.CloseTrigger class="btn btn-sm preset-tonal">Cancel</Popover.CloseTrigger>
                <Popover.CloseTrigger class="btn btn-sm preset-filled" onclick={saveBinding}>
                  Save
                </Popover.CloseTrigger>
              </div>
            </div>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover>
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
