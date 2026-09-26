<script lang="ts">
  import { deviceStatus } from "$live/devices";

  let { id }: { id: string } = $props();

  // The store is built once per `id`; svelte-realtime caches and refcounts
  // stream instances per topic, so re-renders reuse this one.
  //
  // `$`-prefix auto-subscription is used instead of `.rune()` because the
  // server-side `$live` shim for a dynamic stream is a plain `readable()` with
  // no `rune` method, so `.rune()` throws during SSR. `$store` works in both
  // SSR and the browser.
  const status = $derived(deviceStatus(id));
</script>

{#if typeof $status === "string"}
  {$status}
{:else if $status}
  {typeof $status.error === "string" ? $status.error : "Error"}
{/if}
