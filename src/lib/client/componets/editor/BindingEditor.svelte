<script lang="ts">
  import { BracesIcon, Unlink2Icon } from "@lucide/svelte";
  import { Popover, Portal } from "@skeletonlabs/skeleton-svelte";
  import type { ScriptScope } from "$lib/client/editor/script/scriptScopes";
  import ScriptEditor from "./ScriptEditor.svelte";

  let {
    label,
    binding,
    contextDescription = "tag(), tagValue(), tagStatus(), props, and element",
    scope,
    savedError = null,
    onBindingSave,
    onBindingRemove,
  }: {
    label: string;
    binding: string;
    contextDescription?: string;
    scope: ScriptScope;
    savedError?: string | null;
    onBindingSave: (expression: string) => void;
    onBindingRemove: () => void;
  } = $props();

  let draftBinding = $state("");
  let lastBinding: string | null = null;
  let isBound = $derived(binding.trim().length > 0);
  let hasError = $derived(Boolean(savedError));

  $effect(() => {
    if (binding === lastBinding) return;

    lastBinding = binding;
    draftBinding = binding;
  });

  function saveBinding() {
    onBindingSave(draftBinding.trim());
  }

  function revertBinding() {
    draftBinding = binding;
  }
</script>

<Popover>
  <Popover.Trigger
    type="button"
    class="btn btn-sm {hasError
      ? 'preset-filled-error-500'
      : isBound
        ? 'preset-filled'
        : 'preset-tonal'} shrink-0"
    aria-invalid={hasError}
    title={hasError ? savedError : isBound ? binding : "Add binding"}
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
            Expressions receive
            <code>{contextDescription}</code>
            .
          </p>

          <ScriptEditor
            value={draftBinding}
            height="300px"
            ariaLabel={`${label} binding expression`}
            {scope}
            onchange={(next) => (draftBinding = next)}
          />

          {#if savedError}
            <div
              class="rounded-lg border border-error-400-600/40 bg-error-500/10 p-2 text-error-400-600"
              role="alert"
            >
              <p class="font-semibold">Binding error</p>
              <p class="whitespace-pre-wrap break-words text-xs">{savedError}</p>
            </div>
          {/if}

          <div class="flex justify-end gap-2">
            <Popover.CloseTrigger class="btn btn-sm preset-tonal" onclick={revertBinding}>
              Cancel
            </Popover.CloseTrigger>
            <Popover.CloseTrigger class="btn btn-sm preset-filled" onclick={saveBinding}>
              Save
            </Popover.CloseTrigger>
          </div>
        </div>
      </Popover.Content>
    </Popover.Positioner>
  </Portal>
</Popover>
