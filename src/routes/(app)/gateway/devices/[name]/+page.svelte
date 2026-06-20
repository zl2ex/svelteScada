<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import Popup from "$lib/client/componets/Popup.svelte";
  import CheckboxInput from "$lib/client/componets/remoteFormElements/CheckboxInput.svelte";
  import NumberInput from "$lib/client/componets/remoteFormElements/NumberInput.svelte";
  import SelectInput from "$lib/client/componets/remoteFormElements/SelectInput.svelte";
  import TextInput from "$lib/client/componets/remoteFormElements/TextInput.svelte";
  import Tree from "$lib/client/componets/Tree.svelte";
  import {
    deleteDevice,
    getAvalibleDrivers,
    getDevice,
    updateDevice,
    getDefaultDriverOptions,
    browseOpcua,
  } from "$lib/remote/devices.remote";
  import { LoaderIcon } from "@lucide/svelte";

  //let selectedDriver = $state(undefined);

  //$inspect(selectedDriver);
  /*
  const newDeviceOptions = {
    name: "newDevice",
    driverName: "ModbusTCPDriver",
    enabled: true,
    options: {
      ip: "127.0.0.1",
      port: 502,
      unitId: 1,
      endian: "BigEndian",
      pollingIntervalMs: 1000,
      reconnectInervalMs: 5000,
      spanGaps: false,
      startAddress: 1,
      swapWords: false,
    },
  } satisfies DeviceOptions;
*/

  let browseOpcuaPopup = $state(false);

  const defaultDriverOptions = await getDefaultDriverOptions();

  let newDevice = $derived.by(async () => {
    // must track varible for $derrived before the await or else it is not tracked for updates
    let selectedDriver = updateDevice.fields.driverName.value();

    let device = await getDevice(page.params.name ?? "").catch((e) =>
      console.error(e),
    );

    // no device so make a new one with defaults
    if (!device) {
      let options = selectedDriver
        ? defaultDriverOptions[selectedDriver]
        : undefined;

      device = {
        name: "newDevice",
        driverName: selectedDriver,
        options,
        status: "Reconnecting",
        enabled: true,
      };
    }
    // we got a device from the server so update the select feild
    else {
      updateDevice.fields.driverName.set(device.driverName);
    }
    return device;
  });
</script>

<div id="page">
  <svelte:boundary>
    {#await newDevice then device}
      <form
        class="max-w-md space-y-4 p-4"
        {...updateDevice.enhance(({ form, data, submit }) => {
          submit();
        })}
      >
        <div class="form-item">
          <h2 class="h2">{device?.name}</h2>
          <input {...updateDevice.fields.name.as("hidden", device.name)} />
          {#each updateDevice.fields.name.issues() ?? [] as issue}
            <span class="text-warning-950-50 border-b-warning-400-600"
              >{issue.message}</span
            >
          {/each}
        </div>

        <CheckboxInput
          remoteFormFeild={updateDevice.fields.enabled}
          defaultValue={device?.enabled}
          label="Enabled"
        ></CheckboxInput>

        <SelectInput
          remoteFormFeild={updateDevice.fields.driverName}
          defaultValue={device?.driverName}
          label="Driver"
        >
          <option value={undefined}></option>
          {#each await getAvalibleDrivers() as option}
            <option value={option.id}>{option.displayName}</option>
          {/each}
        </SelectInput>

        {#if device?.driverName === "ModbusTCPDriver" && updateDevice.fields.driverName.value() === "ModbusTCPDriver"}
          <NumberInput
            remoteFormFeild={updateDevice.fields.options.unitId}
            defaultValue={device.options.unitId}
            label="Unit ID"
          ></NumberInput>

          <CheckboxInput
            remoteFormFeild={updateDevice.fields.options.spanGaps}
            defaultValue={device.options.spanGaps}
            label="Span Gaps"
          ></CheckboxInput>

          <TextInput
            remoteFormFeild={updateDevice.fields.options.ip}
            defaultValue={device.options.ip}
            label="IP Address"
          ></TextInput>

          <NumberInput
            remoteFormFeild={updateDevice.fields.options.port}
            defaultValue={device.options.port}
            label="Port"
          ></NumberInput>

          <NumberInput
            remoteFormFeild={updateDevice.fields.options.pollingIntervalMs}
            defaultValue={device.options.pollingIntervalMs}
            label="Polling Interval ms"
          ></NumberInput>

          <NumberInput
            remoteFormFeild={updateDevice.fields.options.reconnectInervalMs}
            defaultValue={device.options.reconnectInervalMs}
            label="Reconnect Inerval ms"
          ></NumberInput>

          <NumberInput
            remoteFormFeild={updateDevice.fields.options.startAddress}
            defaultValue={device.options.startAddress}
            label="Start Address"
          ></NumberInput>

          <SelectInput
            remoteFormFeild={updateDevice.fields.options.endian}
            defaultValue={device.options.endian}
            label="Endian"
          >
            <option value="BigEndian">Big Endian</option>
            <option value="LittleEndian">Little Endian</option>
          </SelectInput>
        {:else if device?.driverName === "ModbusRTUDriver"}
          <TextInput
            remoteFormFeild={updateDevice.fields.options.serialPort}
            defaultValue={device.options.serialPort}
            label="serialPort"
          ></TextInput>

          <NumberInput
            remoteFormFeild={updateDevice.fields.options.baudRate}
            defaultValue={device.options.baudRate}
            label="baudRate"
          ></NumberInput>

          <TextInput
            remoteFormFeild={updateDevice.fields.options.parity}
            defaultValue={device.options.parity}
            label="Parity"
          ></TextInput>

          <NumberInput
            remoteFormFeild={updateDevice.fields.options.unitId}
            defaultValue={device.options.unitId}
            label="Unit Id"
          ></NumberInput>

          <CheckboxInput
            remoteFormFeild={updateDevice.fields.options.spanGaps}
            defaultValue={device.options.spanGaps}
            label="Span Gaps"
          ></CheckboxInput>

          <NumberInput
            remoteFormFeild={updateDevice.fields.options.pollingIntervalMs}
            defaultValue={device.options.pollingIntervalMs}
            label="Polling Interval ms"
          ></NumberInput>

          <NumberInput
            remoteFormFeild={updateDevice.fields.options.startAddress}
            defaultValue={device.options.startAddress}
            label="Start Address"
          ></NumberInput>

          <SelectInput
            remoteFormFeild={updateDevice.fields.options.endian}
            defaultValue={device.options.endian}
            label="Endian"
          >
            <option value="BigEndian">Big Endian</option>
            <option value="LittleEndian">Little Endian</option>
          </SelectInput>
        {:else if device?.driverName === "opcuaClientDriver"}
          <TextInput
            remoteFormFeild={updateDevice.fields.options.endpointUrl}
            defaultValue={device.options.endpointUrl}
            label="Endpoint URL"
          ></TextInput>

          <button
            class="btn"
            type="button"
            onclick={() => (browseOpcuaPopup = true)}>browse</button
          >

          <Popup bind:open={browseOpcuaPopup}>
            <p>browse opcua</p>
            <Tree
              nodes={await browseOpcua({
                deviceName: device.name,
                nodeId: "ns=0;i=84;",
              })}
              loadChildren={async (details) =>
                await browseOpcua({
                  deviceName: device.name,
                  nodeId: device.nodeId,
                })}
            ></Tree>
          </Popup>
        {/if}

        <div class="form-item-row">
          <button type="submit" class="btn preset-filled">save</button>
          <button
            type="button"
            class="btn preset-filled-error-400-600"
            onclick={async () => {
              await deleteDevice(device.name);
              goto("/editor/devices");
            }}>delete</button
          >
        </div>

        {#each updateDevice.fields.allIssues() ?? [] as issue}
          <span class="text-warning-950-50 border-b-warning-400-600"
            >{issue.message}</span
          >
        {/each}
      </form>
    {/await}

    {#snippet pending()}
      <LoaderIcon class="size-4 animate-spin" />
    {/snippet}
    {#snippet failed(error, reset)}
      <p class="text-error-50-950">{error}</p>
      <button onclick={reset} class="btn preset-filled-error-50-950"
        >reset</button
      >
    {/snippet}
  </svelte:boundary>
</div>
