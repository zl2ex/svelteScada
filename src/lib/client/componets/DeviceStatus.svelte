<script lang="ts">
  import { deviceStatus } from "$live/devices";
  import { UseStreamResult } from "$lib/client/live/streamResult.svelte";
  import { CircleIcon } from "@lucide/svelte";
  import type { HTMLAttributes } from "svelte/elements";

  interface Props extends HTMLAttributes<HTMLDivElement> {
    id: string;
    class?: string;
  }

  let { id, class: clazz, ...rest }: Props = $props();

  const status = deviceStatus(id);

  // A factory, not a store, so changing `id` resubscribes to the new topic.
  const stream = new UseStreamResult(() => deviceStatus(id));

  $effect(() => {
    console.log("[DEBUG] status event:", $status);
  });

  $effect(() => {
    console.log(
      "[DEBUG] stream event:",
      stream.value,
      stream.status,
      stream.error,
    );
  });
</script>

<svelte:boundary
  onerror={(error) => {
    console.error(error);
  }}
>
  <div class={"flex items-center gap-2 " + clazz} {...rest}>
    {#if stream.status === "error"}
      <!-- transient: the last known status is stale, not wrong -->
      <span class="text-error-400-600 opacity-65"
        >{stream.error.code} {stream.error.message}</span
      >
    {:else if stream.status === "loading"}
      <!--loading-->
    {:else}
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
    {/if}
  </div>

  {#snippet failed(error: unknown)}
    <span class="text-error-400-600">{String(error)}</span>
  {/snippet}
</svelte:boundary>
