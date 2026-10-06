<script lang="ts">
  import { undoManager } from "$lib/client/history/undoManager.js";
  import { PatchCollection } from "$lib/client/live/patchCollection.svelte";
  import DeviceStatus from "$lib/client/componets/DeviceStatus.svelte";
  import type { DeviceConfigInput, DriverName, OptionFieldKind } from "$lib/server/drivers/driver";
  import type { NeverThrowError } from "$lib/util/neverThrow";
  import { applyDevicePatches, devicePatches } from "$live/devices";
  import { EllipsisVerticalIcon, PlusIcon, Trash2 } from "@lucide/svelte";
  import { Popover, Portal, usePopover } from "@skeletonlabs/skeleton-svelte";
  import { newId } from "$lib/util/newId";
  import { getAvalibleDrivers } from "$lib/remote/devices.remote";
  let { data } = $props();

  let popoverDeviceId = $state("");

  const popover = usePopover({
    id: "devices-popover",
    positioning: { placement: "bottom-start" },
    onOpenChange: (details) => {
      // closed
      if (!details.open) {
        // added new device push to history and server, but a device without a
        // driver has no options to write and nothing the server can build, so
        // it only counts as added once the select has made it one
        if (popoverDeviceId == newDevice.id && newDevice.driverName !== "") {
          devicesPatchesCollection.add(newDevice);
        }
      }
    },
  });

  const devicesPatchesCollection = new PatchCollection<DeviceConfigInput, NeverThrowError>({
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

  /**
   * A device the user is still building: the driver is unset until the select
   * makes it one, which is the same shape a device gets from the server minus
   * the options its driver has not chosen yet.
   */
  type DeviceDraft =
    | { id: string; name: string; enabled: boolean; driverName: ""; options: Record<string, never> }
    | DeviceConfigInput;

  const newDevice = $state<DeviceDraft>({
    id: newId(),
    name: "newDevice",
    driverName: "",
    options: {},
    enabled: true,
  });

  /** One option field as the UI sees it, whatever driver is behind it. */
  type UiOptionField = {
    label: string;
    kind: OptionFieldKind;
    choices?: readonly string[];
  };

  /**
   * The option fields are metadata keyed by option name, so the read goes
   * through a `string` key too.
   */
  function readOption(device: DeviceConfigInput | DeviceDraft, key: string) {
    return (device.options as Record<string, string | number | boolean | undefined>)[key];
  }

  /**
   * What a field may hold is settled by the driver's zod schema, which the
   * server re-parses the whole options object against on every write - a value
   * it rejects comes back as an error and the patch is rolled back.
   */
  function setOption(
    device: DeviceConfigInput | DeviceDraft,
    key: string,
    value: string | number | boolean,
  ) {
    const options = {
      ...device.options,
      [key]: value,
    } as DeviceConfigInput["options"];

    if (popoverDeviceId == newDevice.id) {
      newDevice.options = options;
      return;
    }
    devicesPatchesCollection.update(device.id, { options });
  }

  /** A blank or unparseable number is not an edit, so it changes nothing. */
  function numberFromInput(raw: string) {
    if (raw.trim() === "") return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
</script>

<!--
  One control per field the registry describes for the selected driver, so a
  driver that has never been rendered here needs no UI of its own.
-->
{#snippet optionField(
  field: UiOptionField,
  key: string,
  device: DeviceConfigInput | DeviceDraft,
  clazz?: string,
)}
  {@const option = readOption(device, key)}
  {@const text = String(option ?? "")}
  {#if field.kind === "boolean"}
    <input
      id={`device-${device.id}-${key}`}
      type="checkbox"
      class={"checkbox " + clazz}
      checked={option === true}
      onchange={(ev) => setOption(device, key, ev.currentTarget.checked)}
    />
  {:else if field.kind === "select"}
    <select
      id={`device-${device.id}-${key}`}
      class={"select " + clazz}
      value={text}
      onchange={(ev) => setOption(device, key, ev.currentTarget.value)}
    >
      {#each field.choices ?? [] as choice (choice)}
        <option value={choice}>{choice}</option>
      {/each}
    </select>
  {:else}
    <input
      id={`device-${device.id}-${key}`}
      type={field.kind === "number" ? "number" : "text"}
      class={"input " + clazz}
      value={text}
      onblur={(ev) => {
        const value =
          field.kind === "number"
            ? numberFromInput(ev.currentTarget.value)
            : ev.currentTarget.value;
        if (value === undefined) {
          // not a number, so put the stored value back rather than store NaN
          ev.currentTarget.value = text;
          return;
        }
        setOption(device, key, value);
      }}
      onkeydown={(ev) => {
        if (ev.key === "Enter") {
          ev.currentTarget.blur();
        }
        if (ev.key === "Escape") {
          ev.currentTarget.value = text;
          ev.currentTarget.blur();
        }
      }}
    />
  {/if}
{/snippet}

<div id="devices" class="m-8 grow">
  <button
    class="btn preset-outlined mx-2"
    onclick={async () => {
      popoverDeviceId = newId();
      newDevice.id = popoverDeviceId;
      // user must select driver type
      newDevice.driverName = "";
      popover().setOpen(true);
    }}
  >
    <PlusIcon></PlusIcon>
    Add
  </button>
  <Popover.Provider value={popover}>
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
        {#each Object.values(devicesPatchesCollection.state).sort( (a, b) => a.name.localeCompare(b.name) ) as device (device.id)}
          <tr
            class="*:py-4 *:px-8 border-b-1 border-b-surface-300-700 hover:bg-surface-100-900 data-[state=open]:bg-surface-150-850"
          >
            <td>
              <Popover.Trigger
                class="hover:bg-surface-200-800 rounded-lg"
                onclick={() => (popoverDeviceId = device.id)}
              >
                <EllipsisVerticalIcon class="size-6 m-4" />
              </Popover.Trigger>
            </td>
            <td class="font-bold text-lg">{device.name}</td>
            <td class="flex items-center gap-2">
              <img src={availableDrivers[device.driverName]?.logo} alt="" class="w-24" />
              {availableDrivers[device.driverName]?.displayName}
            </td>
            <td>
              <DeviceStatus id={device.id} class="flex-row-reverse gap-6" />
            </td>
          </tr>
        {/each}
      </tbody>
    </table>

    <Portal>
      <Popover.Positioner>
        <Popover.Content class="card p-4 preset-filled-surface-100-900">
          {#if devicesPatchesCollection.state[popoverDeviceId] || newDevice.id == popoverDeviceId}
            {@const device = devicesPatchesCollection.state[popoverDeviceId] ?? newDevice}
            <div>
              <div class="flex justify-between">
                <div class="p-4">
                  <label
                    class="shrink-0 whitespace-nowrap opacity-60"
                    for={`device-${device.id}-name`}
                  >
                    Name
                  </label>
                  <input
                    id={`device-${device.id}-name`}
                    type="text"
                    class="input"
                    value={device.name}
                    onblur={(ev) => {
                      const name = String(ev.currentTarget.value);
                      if (popoverDeviceId == newDevice.id) {
                        newDevice.name = name;
                        return;
                      }
                      devicesPatchesCollection.update(popoverDeviceId, {
                        name,
                      });
                    }}
                    onkeydown={(ev) => {
                      if (ev.key === "Enter") {
                        ev.currentTarget.blur();
                      }
                      if (ev.key === "Escape") {
                        ev.currentTarget.value = device.name;
                        ev.currentTarget.blur();
                      }
                    }}
                  />
                </div>

                <div class="p-4 flex gap-4 items-center">
                  <label class=" whitespace-nowrap opacity-60" for={`device-${device.id}-enabled`}>
                    Enabled
                  </label>
                  <input
                    id={`device-${device.id}-enabled`}
                    type="checkbox"
                    class="checkbox"
                    checked={device.enabled}
                    onchange={(ev) => {
                      const enabled = Boolean(ev.currentTarget.checked);
                      if (popoverDeviceId == newDevice.id) {
                        newDevice.enabled = enabled;
                        return;
                      }
                      devicesPatchesCollection.update(popoverDeviceId, {
                        enabled,
                      });
                    }}
                  />
                </div>
              </div>

              <hr />

              <div class="flex items-center justify-between">
                <label
                  class="shrink-0 whitespace-nowrap opacity-60"
                  for={`device-${device.id}-driverName`}
                >
                  Driver
                </label>
                <select
                  id={`device-${device.id}-driverName`}
                  class="select w-60"
                  value={device.driverName}
                  onchange={(ev) => {
                    const driverName = String(ev.currentTarget.value);
                    if (!isDriverName(driverName)) return;
                    if (popoverDeviceId == newDevice.id) {
                      newDevice.driverName = driverName;
                      newDevice.options = availableDrivers[driverName].defaultOptions;
                      return;
                    }

                    // The two drivers' options are unrelated shapes, so a
                    // driver change cannot carry the old options across - send
                    // the new driver's defaults with it. The server resets to
                    // the same defaults and drops the stale rows in a
                    // transaction, so both sides agree on what the device is.
                    devicesPatchesCollection.update(popoverDeviceId, {
                      driverName,
                      options: availableDrivers[driverName].defaultOptions,
                    });
                  }}
                >
                  {#each Object.values(availableDrivers) as driver (driver.id)}
                    <option value={driver.id}>{driver.displayName}</option>
                  {/each}
                </select>
              </div>

              <!-- the selected driver's own options, whatever they turn out to be -->
              {#if isDriverName(device.driverName)}
                {@const optionFields = availableDrivers[device.driverName].optionFields}
                <div class="flex flex-col gap-2 pt-2">
                  {#each Object.entries(optionFields) as [key, field] (key)}
                    <div class="flex items-center justify-between">
                      <label
                        class="shrink-0 whitespace-nowrap opacity-60"
                        for={`device-${device.id}-${key}`}
                      >
                        {field.label}
                      </label>
                      {@render optionField(field, key, device, "w-60")}
                    </div>
                  {/each}
                </div>
              {/if}

              <div class="flex justify-end pt-2">
                <button
                  type="button"
                  class="btn preset-filled-error-400-600 text-xs"
                  onclick={() => {
                    if (!popoverDeviceId) return;
                    devicesPatchesCollection.remove(popoverDeviceId);
                    const pop = popover();
                    pop.setOpen(false);
                    popoverDeviceId = "";
                  }}
                >
                  <Trash2 class="size-4" />
                  Delete Device
                </button>
              </div>
            </div>
          {/if}
        </Popover.Content>
      </Popover.Positioner>
    </Portal>
  </Popover.Provider>
</div>
