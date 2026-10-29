<script lang="ts">
  import { Dialog, Portal, Toast } from "@skeletonlabs/skeleton-svelte";
  import { browser } from "$app/environment";
  import { getToaster } from "$lib/client/toast.svelte";

  import { onMount } from "svelte";
  import { configure } from "svelte-realtime/client";
  import { failure, status } from "svelte-adapter-uws/client";
  import { connectionHeartbeat } from "$live/connection";
  import { createTagValueMap } from "$lib/client/live/tagMap.svelte";
  import { setTagValueMapContext } from "$lib/client/live/tagMapContext";
  import { LoaderIcon, NetworkIcon } from "@lucide/svelte";

  const { children, data } = $props();

  const HEARTBEAT_TIMEOUT_MS = 5000;

  let heartbeatWatchdog: ReturnType<typeof setTimeout> | undefined;
  let connectionLost = $state(false);

  function resetHeartbeatWatchdog() {
    if (heartbeatWatchdog) clearTimeout(heartbeatWatchdog);
    connectionLost = false;
    heartbeatWatchdog = setTimeout(() => {
      heartbeatWatchdog = undefined;
      connectionLost = true;
    }, HEARTBEAT_TIMEOUT_MS);
  }

  $effect(() => {
    if (typeof $connectionHeartbeat === "number") {
      resetHeartbeatWatchdog();
    }
  });

  let connectionMessage = $derived.by(() => {
    if ($status !== "failed") {
      return "No heartbeat from the server for 5 seconds. Waiting for the connection to recover...";
    }

    switch ($failure?.class) {
      case "TERMINAL":
        return "Your session is no longer authorized. Reload and sign in again.";
      case "AUTH":
        return `Authentication failed (HTTP ${$failure.status}). Reload and sign in again.`;
      case "EXHAUSTED":
        return "Could not reconnect to the server. Reload to try again.";
      case "THROTTLE":
        return "The server is busy. Reconnecting...";
      default:
        return "The realtime connection stopped. Reload to reconnect.";
    }
  });

  const tagValueMap = createTagValueMap(data);
  setTagValueMapContext(tagValueMap);

  onMount(() => {
    resetHeartbeatWatchdog();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        resetHeartbeatWatchdog();
        return;
      }

      if (heartbeatWatchdog) clearTimeout(heartbeatWatchdog);
      heartbeatWatchdog = undefined;
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (heartbeatWatchdog) clearTimeout(heartbeatWatchdog);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      tagValueMap.dispose();
    };
  });

  // Offline queue — realtime-svelte
  configure({
    offline: {
      queue: true,
      maxQueue: 200,
      //maxAge: 5 * 60 * 1000,
      beforeReplay: (call) => Date.now() - call.queuedAt < 5 * 60 * 1000,
      onReplayError: (call, err) => console.warn("Replay failed", call, err),
    },
    timeout: 2000,
  });
</script>

{@render children?.()}
{#if browser}
  <Dialog
    open={connectionLost}
    role="alertdialog"
    closeOnEscape={false}
    closeOnInteractOutside={false}
    preventScroll
  >
    <Portal>
      <Dialog.Backdrop class="fixed inset-0 bg-surface-50-950/75 backdrop-blur-sm" />
      <Dialog.Positioner class="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Content class="card w-full max-w-md p-6 shadow-2xl">
          <header class="flex items-center gap-3">
            <div class="rounded-full preset-filled-error-500 p-2">
              <NetworkIcon class="size-5" />
            </div>
            <Dialog.Title class="text-lg font-bold">Connection Lost</Dialog.Title>
          </header>
          <Dialog.Description class="mt-4 text-sm opacity-70">
            {connectionMessage}
          </Dialog.Description>
          <div class="mt-6 flex items-center justify-end gap-3">
            {#if $status !== "failed"}
              <LoaderIcon class="size-4 animate-spin" />
              <span class="text-xs opacity-60">Waiting for server...</span>
            {/if}
            <button
              type="button"
              class="btn preset-filled"
              onclick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Positioner>
    </Portal>
  </Dialog>
{/if}
{#if browser}
  {@const toaster = getToaster()}
  {#if toaster.isOk()}
    <Toast.Group toaster={toaster.value}>
      {#snippet children(toast)}
        <Toast {toast}>
          <Toast.Message>
            <Toast.Title>{toast.title}</Toast.Title>
            {#if toast.description}
              <Toast.Description>{toast.description}</Toast.Description>
            {/if}
          </Toast.Message>
          <Toast.CloseTrigger />
        </Toast>
      {/snippet}
    </Toast.Group>
  {/if}
{/if}
