<script lang="ts">
  import { goto } from "$app/navigation";
  import Popup from "$lib/client/componets/Popup.svelte";
  import {
    getAvalibleDrivers,
    getDevices,
    updateDevice,
  } from "$lib/remote/devices.remote";
  import { PlusIcon } from "@lucide/svelte";
  import { onMount } from "svelte";

  let showPopup = $state(false);

  let pollTimeout: NodeJS.Timeout;

  function poll() {
    getDevices({}).refresh(); // get device status every 2 seconds
    pollTimeout = setTimeout(poll, 2000);
  }
  /*
  function updateDeviceEnabledSubmit(name: string) {
    let form = document.querySelector(`#${name}`);
    console.log(form);
    if (form instanceof HTMLFormElement) {
      form.requestSubmit();
    } else {
      console.error(`updateDeviceEnabledSubmit(${name}) form undefined`);
    }
  }*/

  onMount(() => {
    poll();
    return () => {
      clearTimeout(pollTimeout);
    };
  });
</script>

<!--
  {#snippet formItem(name: string, value: RemoteFormFieldValue, form: RemoteFormField<typeof value>, default: any)}
    <label>
      {name}
      <input
      {...form}
      checked={default}
      />
      
      {#each updateDeviceEnabled.fields.enabled.issues() ?? [] as issue}
      <span class="text-error-600-400">{issue.message}</span>
      {/each}
    </label>
    {/snippet}
    -->

<div class="grid grid-flow-col gap-2">
  <svelte:boundary>
    <Popup bind:open={showPopup}>
      <form {...updateDevice} style="padding: 0.4rem">
        <div class="form-item">
          <label for="name">name</label>
          <input {...updateDevice.fields.name.as("text")} />
          {#each updateDevice.fields.name.issues() ?? [] as issue}
            <span class="text-error-600-400">{issue.message}</span>
          {/each}
        </div>
        <div class="form-item-row">
          <label for="enabled">enabled</label>
          <input {...updateDevice.fields.enabled.as("checkbox")} />
          {#each updateDevice.fields.enabled.issues() ?? [] as issue}
            <span class="text-error-600-400">{issue.message}</span>
          {/each}
        </div>

        <div class="form-item">
          <label for="driverName">driverName</label>
          <select {...updateDevice.fields.driverName.as("select")}>
            {#each await getAvalibleDrivers() as option}
              <option value={option.id}>{option.displayName}</option>
            {/each}
          </select>
          {#each updateDevice.fields.driverName.issues() ?? [] as issue}
            <span class="text-error-600-400">{issue.message}</span>
          {/each}
        </div>

        {#if updateDevice.fields.driverName.value() == "ModbusTCPDriver"}
          <div class="form-item">
            <label for="unitId">unitId</label>
            <input {...updateDevice.fields.options.unitId.as("number")} />
            {#each updateDevice.fields.options.unitId.issues() ?? [] as issue}
              <span class="text-error-600-400">{issue.message}</span>
            {/each}
          </div>

          <div class="form-item-row">
            <label for="spanGaps">spanGaps</label>
            <input {...updateDevice.fields.options.spanGaps.as("checkbox")} />
            {#each updateDevice.fields.options.spanGaps.issues() ?? [] as issue}
              <span class="text-error-600-400">{issue.message}</span>
            {/each}
          </div>

          <div class="form-item">
            <label for="ip">ip</label>
            <input {...updateDevice.fields.options.ip.as("text")} />
            {#each updateDevice.fields.options.ip.issues() ?? [] as issue}
              <span class="text-error-600-400">{issue.message}</span>
            {/each}
          </div>

          <div class="form-item">
            <label for="port">port</label>
            <input {...updateDevice.fields.options.port.as("number")} />
            {#each updateDevice.fields.options.port.issues() ?? [] as issue}
              <span class="text-error-600-400">{issue.message}</span>
            {/each}
          </div>

          <div class="form-item">
            <label for="pollingIntervalMs">pollingIntervalMs</label>
            <input
              {...updateDevice.fields.options.pollingIntervalMs.as("number")}
            />
            {#each updateDevice.fields.options.pollingIntervalMs.issues() ?? [] as issue}
              <span class="text-error-600-400">{issue.message}</span>
            {/each}
          </div>

          <div class="form-item">
            <label for="reconnectInervalMs">reconnectInervalMs</label>
            <input
              {...updateDevice.fields.options.reconnectInervalMs.as("number")}
            />
            {#each updateDevice.fields.options.reconnectInervalMs.issues() ?? [] as issue}
              <span class="text-error-600-400">{issue.message}</span>
            {/each}
          </div>

          <div class="form-item">
            <label for="startAddress">startAddress</label>
            <input {...updateDevice.fields.options.startAddress.as("number")} />
            {#each updateDevice.fields.options.startAddress.issues() ?? [] as issue}
              <span class="text-error-600-400">{issue.message}</span>
            {/each}
          </div>

          <div class="form-item">
            <label for="endian">endian</label>
            <select {...updateDevice.fields.options.endian.as("select")}>
              <option value="BigEndian">Big Endian</option>
              <option value="LittleEndian">Little Endian</option>
            </select>
            {#each updateDevice.fields.options.endian.issues() ?? [] as issue}
              <span class="text-error-600-400">{issue.message}</span>
            {/each}
          </div>
        {:else if updateDevice.fields.driverName.value() == "ModbusRTUDriver"}
          <div class="form-item">
            <label for="serialPort">serial port</label>
            <input {...updateDevice.fields.options.serialPort.as("text")} />
            {#each updateDevice.fields.options.serialPort.issues() ?? [] as issue}
              <span class="text-error-600-400">{issue.message}</span>
            {/each}
          </div>

          <div class="form-item">
            <label for="baudRate">baudRate</label>
            <input {...updateDevice.fields.options.baudRate.as("number")} />
            {#each updateDevice.fields.options.baudRate.issues() ?? [] as issue}
              <span class="text-error-600-400">{issue.message}</span>
            {/each}
          </div>

          <div class="form-item">
            <label for="parity">parity</label>
            <select {...updateDevice.fields.options.parity.as("string")}>
              {#each ["none", "even", "odd"] as option}
                <option value={option}>{option}</option>
              {/each}
            </select>
            {#each updateDevice.fields.options.parity.issues() ?? [] as issue}
              <span class="text-error-600-400">{issue.message}</span>
            {/each}
          </div>

          <div class="form-item">
            <label for="unitId">unitId</label>
            <input {...updateDevice.fields.options.unitId.as("number")} />
            {#each updateDevice.fields.options.unitId.issues() ?? [] as issue}
              <span class="text-error-600-400">{issue.message}</span>
            {/each}
          </div>

          <div class="form-item-row">
            <label for="spanGaps">spanGaps</label>
            <input {...updateDevice.fields.options.spanGaps.as("checkbox")} />
            {#each updateDevice.fields.options.spanGaps.issues() ?? [] as issue}
              <span class="text-error-600-400">{issue.message}</span>
            {/each}
          </div>

          <div class="form-item">
            <label for="pollingIntervalMs">pollingIntervalMs</label>
            <input
              {...updateDevice.fields.options.pollingIntervalMs.as("number")}
            />
            {#each updateDevice.fields.options.pollingIntervalMs.issues() ?? [] as issue}
              <span class="text-error-600-400">{issue.message}</span>
            {/each}
          </div>

          <div class="form-item">
            <label for="startAddress">startAddress</label>
            <input {...updateDevice.fields.options.startAddress.as("number")} />
            {#each updateDevice.fields.options.startAddress.issues() ?? [] as issue}
              <span class="text-error-600-400">{issue.message}</span>
            {/each}
          </div>

          <div class="form-item">
            <label for="endian">endian</label>
            <select {...updateDevice.fields.options.endian.as("select")}>
              <option value="BigEndian">Big Endian</option>
              <option value="LittleEndian">Little Endian</option>
            </select>
            {#each updateDevice.fields.options.endian.issues() ?? [] as issue}
              <span class="text-error-600-400">{issue.message}</span>
            {/each}
          </div>
        {/if}

        <button type="submit" class="primary">save</button>

        {#each updateDevice.fields.allIssues() ?? [] as issue}
          <span class="text-error-600-400">{issue.message}</span>
        {/each}
      </form>
    </Popup>

    {#each await getDevices({}) as device}
      <div class="space-y-2 p-4 border rounded-lg">
        <!--
          <pre>
            {JSON.stringify(device, null, 2)}
          </pre>
          <h4>{device.name}</h4>
          -->
        <h3 class="h3">{device.name}</h3>
        <p>{device.driverName}</p>
        <div class="flex items-center gap-2">
          <svg
            viewBox="0 0 100 100"
            class={"size-4 fill-neutral-500" + " " + device.status}
          >
            <g stroke-width="2%">
              <circle cx="50%" cy="50%" r="45%"></circle>
            </g>
          </svg>
          <span>{device.status}</span>
        </div>
        <!--
          <form
          class="updateDeviceEnabled"
          id={device.name}
          {...updateDeviceEnabled.for(device.name)}
          >
          <input
            {...updateDeviceEnabled.fields.name.as("hidden", device.name)}
          />
          <div class="form-item">
            <label>
              enabled
              <input
                {...updateDeviceEnabled.fields.enabled.as("checkbox")}
                checked={device.options.enabled}
                onchange={() => updateDeviceEnabledSubmit(device.name)}
                />
              </label>
              
              {#each updateDeviceEnabled.fields.enabled.issues() ?? [] as issue}
              <span class="text-error-600-400">{issue.message}</span>
              {/each}
            </div>
            
            {#each updateDeviceEnabled.fields.allIssues() ?? [] as issue}
            <span class="text-error-600-400">{issue.message}</span>
            {/each}
            
          </form>
        -->

        <div class="form-item">
          <a href="devices/{device.name}" tabindex="-1">
            <button class="btn preset-filled">edit </button>
          </a>
        </div>
        <!--
        <form {...updateDevice}>
          <label>
            <input {...updateDevice.fields.name.as("text")} />
            name
            </label>
            {#each updateDevice.fields.name.issues() ?? [] as issue}
            <span class="text-error-600-400">{issue.message}</span>
            {/each}
            
          {#each updateDevice.fields.allIssues() ?? [] as issue}
          <span class="text-error-600-400">{issue.message}</span>
          {/each}
          </form>
          -->
      </div>
    {/each}

    <a class="btn preset-outlined" href="devices/newDevice">
      <PlusIcon class="size-4"></PlusIcon>
      new device
    </a>

    {#snippet pending()}
      <p>loading...</p>
    {/snippet}
    {#snippet failed(error, reset)}
      <p>{error}</p>
      <button onclick={reset} class="btn">oops! try again</button>
    {/snippet}
  </svelte:boundary>
</div>

<style>
  .Reconnecting {
    fill: light-dark(
      var(--color-warning-300) /* oklch(0.87 0 0) = #d4d4d4 */,
      var(--color-warning-700) /* oklch(0.371 0 0) = #404040 */
    );
    animation: var(--animate-pulse);
  }

  .Connected {
    fill: light-dark(
      var(--color-success-300) /* oklch(0.87 0 0) = #d4d4d4 */,
      var(--color-success-700) /* oklch(0.371 0 0) = #404040 */
    );
  }
</style>
