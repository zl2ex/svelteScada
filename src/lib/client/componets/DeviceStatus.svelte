<script lang="ts">
  import { deviceStatus } from "$live/devices";
  import { UseStreamResult } from "$lib/client/live/streamResult.svelte";
  import { CircleIcon } from "@lucide/svelte";

  let { id }: { id: string } = $props();

  // A factory, not a store, so changing `id` resubscribes to the new topic.
  const stream = new UseStreamResult(() => deviceStatus(id));
</script>

<svelte:boundary
  onerror={(error) => {
    console.error(error);
  }}
>
  {#if stream.status === "error"}
    <!-- transient: the last known status is stale, not wrong -->
    <span class="text-error-400-600 opacity-65"
      >{stream.error.code} {stream.error.message}</span
    >
  {:else if stream.status === "loading"}
    <!--loading-->
  {:else}
    <div class="flex items-center gap-2">
      <CircleIcon
        class="size-4 stroke-0
        {stream.value == 'Disabled' ? 'fill-surface-600-400' : ''}
        {stream.value == 'Connected' ? 'fill-green-600' : ''}
          {stream.value == 'Reconnecting'
          ? 'fill-warning-500 animate-pulse'
          : ''}
          {stream.value == 'Error' ? 'fill-error-500' : ''}"
      ></CircleIcon>
      <span>{stream.value}</span>
    </div>
  {/if}

  {#snippet failed(error: unknown)}
    <span class="text-error-400-600">{String(error)}</span>
  {/snippet}
</svelte:boundary>
