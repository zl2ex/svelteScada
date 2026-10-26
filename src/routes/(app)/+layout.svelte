<script lang="ts">
  import { Toast } from "@skeletonlabs/skeleton-svelte";
  import { browser } from "$app/environment";
  import { getToaster } from "$lib/client/toast.svelte";

  import { onMount } from "svelte";
  import { configure } from "svelte-realtime/client";
  import { createTagValueMap } from "$lib/client/live/tagMap.svelte";
  import { setTagValueMapContext } from "$lib/client/live/tagMapContext";

  const { children, data } = $props();

  const tagValueMap = createTagValueMap(data);
  setTagValueMapContext(tagValueMap);

  onMount(() => () => tagValueMap.dispose());

  // Offline queue — realtime-svelte
  configure({
    offline: {
      queue: true,
      maxQueue: 200,
      //maxAge: 5 * 60 * 1000,
      beforeReplay: (call) => Date.now() - call.queuedAt < 5 * 60 * 1000,
      onReplayError: (call, err) => console.warn("Replay failed", call, err),
    },
  });
</script>

{@render children?.()}

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
