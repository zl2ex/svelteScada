<script lang="ts">
  import { undoManager } from "$lib/client/history/undoManager.js";
  import { PatchCollection } from "$lib/client/live/patchCollection.svelte";
  import DeviceStatus from "$lib/client/componets/DeviceStatus.svelte";
  import type { DeviceOptions } from "$lib/server/drivers/driver";
  import type { NeverThrowError } from "$lib/util/neverThrow";
  import { applyDevicePatches, devicePatches } from "$live/devices";
  let { data } = $props();

  let devicesPatchesCollection = $state(
    new PatchCollection<DeviceOptions, NeverThrowError>({
      initial: data.deviceOptions,
      applyPatch: applyDevicePatches,
      subscribePatches: (notify) => {
        // adapt tagPatches' store .subscribe() to the (payload) => void shape;
        // the store value is `PatchPayload | undefined | { error }` - map
        // undefined / transport errors to the null "no payload" signal
        const unsubscribe = devicePatches.subscribe((payload) => {
          if (!payload || "error" in payload) {
            notify(null);
            return;
          }
          notify(payload);
        });
        return unsubscribe; // svelte stores' subscribe() already returns an unsubscribe fn
      },
      maxHistory: 50,
      onMutation: () => undoManager.recordMutation("devices"),
      onError: (e) => console.error("Devices sync error:", e),
    }),
  );
</script>

<div id="devices">
  <table>
    <thead>
      <tr class="opacity-65">
        <td class="px-2 py-1">Name</td>
        <td class="px-2 py-1">Driver</td>
        <td class="px-2 py-1">Status</td>
      </tr>
    </thead>
    {#each Object.values(devicesPatchesCollection.state) as device (device.id)}
      <tr>
        <td class="px-2 py-1">{device.name}</td>
        <td class="px-2 py-1">{device.displayName}</td>
        <td class="px-2 py-1"><DeviceStatus id={device.id} /></td>
      </tr>
    {/each}
  </table>
</div>
