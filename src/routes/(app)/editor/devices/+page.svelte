<script lang="ts">
  import { undoManager } from "$lib/client/history/undoManager.js";
  import { PatchCollection } from "$lib/client/live/patchCollection.svelte";
  import DeviceStatus from "$lib/client/componets/DeviceStatus.svelte";
  import type { DeviceConfigInput, DriverName } from "$lib/server/drivers/driver";
  import type { NeverThrowError } from "$lib/util/neverThrow";
  import {
    applyDevicePatches,
    devicePatches,
    deviceStatus,
  } from "$live/devices";
  import {
    KeyboardMusicIcon,
    PlusIcon,
    Settings2Icon,
    Trash2,
  } from "@lucide/svelte";
  import { Popover, Portal, usePopover } from "@skeletonlabs/skeleton-svelte";
  import { newId } from "$lib/util/newId";
  import { getAvalibleDrivers } from "$lib/remote/devices.remote";
  let { data } = $props();

  let popoverDeviceId = $state("");

  const popover = usePopover({
    id: "devices-popover",
    positioning: { placement: "bottom-start" },
    onOpenChange: (details) => {},
  });

  const devicesPatchesCollection = new PatchCollection<
    DeviceConfigInput,
    NeverThrowError
  >({
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
  });

  $effect(() => {
    undoManager.register("devices", devicesPatchesCollection);
    return () => undoManager.unregister("devices");
  });

  // driver metadata, straight off the server registry
  const availableDrivers = await getAvalibleDrivers();

  // A <select> only ever gives back a string, so the discriminant has to be
  // narrowed back before it can go anywhere near a DeviceConfigInput.
  function isDriverName(value: string): value is DriverName {
    return value in availableDrivers;
  }
</script>

<div id="devices" class="m-8 grow">
  <button
    class="btn preset-outlined mx-2"
    onclick={async () => {
      popoverDeviceId = newId();
      const driverName: DriverName = "ModbusTCPDriver";
      devicesPatchesCollection.add({
        id: popoverDeviceId,
        name: "",
        driverName,
        options: availableDrivers[driverName].defaultOptions,
      });
      popover().setOpen(true);
    }}
  >
    <PlusIcon></PlusIcon>
    Add
  </button>
  <table class="w-full">
    <thead>
      <tr class="*:py-4 *:px-8 opacity-70 border-b-1 border-b-surface-300-700">
        <th></th>
        <th class="text-left">Name</th>
        <th class="text-left">Driver</th>
        <th class="text-right">Status</th>
      </tr>
    </thead>
    <tbody>
      {#each Object.values(devicesPatchesCollection.state) as device (device.id)}
        <tr
          class="*:py-4 *:px-8 border-b-1 border-b-surface-300-700 cursor-pointer hover:bg-surface-100-900 data-[state=open]:bg-surface-150-850"
          onclick={() => {
            const pop = popover();
            if (pop.open) return;
            popoverDeviceId = device.id;
            pop.setOpen(true);
          }}
        >
          <td><KeyboardMusicIcon></KeyboardMusicIcon></td>
          <td class="font-bold text-lg">{device.name}</td>
          <td class="flex items-center gap-2">
            <img
              src={availableDrivers[device.driverName].logo}
              alt=""
              class="size-4"
            />
            {availableDrivers[device.driverName].displayName}
          </td>
          <td><DeviceStatus id={device.id} class="flex-row-reverse gap-6" /></td
          >
        </tr>
      {/each}
    </tbody>
  </table>
  <Popover.Provider value={popover}>
    <Popover.Anchor></Popover.Anchor>
    {#if devicesPatchesCollection.state[popoverDeviceId]}
      <Portal>
        <Popover.Positioner>
          <Popover.Content class="card p-4 preset-filled-surface-100-900">
            <div>
              <div class="flex justify-between">
                <div class="p-4">
                  <label
                    class="w-36 shrink-0 whitespace-nowrap opacity-60"
                    for={`device-${devicesPatchesCollection.state[popoverDeviceId].id}-name`}
                    >Name</label
                  >
                  <input
                    id={`device-${devicesPatchesCollection.state[popoverDeviceId].id}-name`}
                    type="text"
                    class="input"
                    value={devicesPatchesCollection.state[popoverDeviceId].name}
                    onblur={(ev) =>
                      devicesPatchesCollection.update(popoverDeviceId, {
                        name: String(ev.currentTarget.value),
                      })}
                    onkeydown={(ev) => {
                      if (ev.key === "Enter") {
                        devicesPatchesCollection.update(popoverDeviceId, {
                          name: String(ev.currentTarget.value),
                        });
                        ev.currentTarget.blur();
                      }
                      if (ev.key === "Escape") {
                        ev.currentTarget.value =
                          devicesPatchesCollection.state[popoverDeviceId].name;
                        ev.currentTarget.blur();
                      }
                    }}
                  />
                </div>

                <div class="p-4 flex gap-4 items-center">
                  <label
                    class=" whitespace-nowrap opacity-60"
                    for={`device-${devicesPatchesCollection.state[popoverDeviceId].id}-enabled`}
                    >Enabled</label
                  >
                  <input
                    id={`device-${devicesPatchesCollection.state[popoverDeviceId].id}-enabled`}
                    type="checkbox"
                    class="checkbox"
                    checked={devicesPatchesCollection.state[popoverDeviceId]
                      .enabled}
                    onchange={(ev) => {
                      devicesPatchesCollection.update(popoverDeviceId, {
                        enabled: Boolean(ev.currentTarget.checked),
                      });
                    }}
                  />
                </div>
              </div>

              <hr />

              <div class="flex items-center gap-2">
                <Settings2Icon class="size-4 shrink-0 opacity-60" />
                <label
                  class="w-36 shrink-0 whitespace-nowrap opacity-60"
                  for={`device-${devicesPatchesCollection.state[popoverDeviceId].id}-driverName`}
                  >Driver</label
                >
                <select
                  id={`device-${devicesPatchesCollection.state[popoverDeviceId].id}-driverName`}
                  class="select"
                  value={devicesPatchesCollection.state[popoverDeviceId]
                    .driverName}
                  onchange={(ev) => {
                    const next = ev.currentTarget.value;
                    if (!isDriverName(next)) return;
                    // The two drivers' options are unrelated shapes, so a
                    // driver change cannot carry the old options across - send
                    // the new driver's defaults with it. The server resets to
                    // the same defaults and drops the stale rows in a
                    // transaction, so both sides agree on what the device is.
                    devicesPatchesCollection.update(popoverDeviceId, {
                      driverName: next,
                      options: availableDrivers[next].defaultOptions,
                    });
                  }}
                >
                  {#each Object.values(availableDrivers) as driver (driver.id)}
                    <option value={driver.id}>{driver.displayName}</option>
                  {/each}
                </select>
              </div>

              <div class="flex justify-end pt-2">
                <button
                  type="button"
                  class="btn preset-filled-error-400-600 text-xs"
                  onclick={() => {
                    if (!popoverDeviceId) return;
                    devicesPatchesCollection.remove(popoverDeviceId);
                    const pop = popover();
                    pop.setOpen(false);
                  }}
                >
                  <Trash2 class="size-4" />
                  Delete Device
                </button>
              </div>
            </div></Popover.Content
          >
        </Popover.Positioner>
      </Portal>
    {/if}
  </Popover.Provider>
</div>
