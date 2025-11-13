<script lang="ts">
  import Popup from "$lib/client/componets/Popup.svelte";
  import {
    getAvalibleDrivers,
    getDevices,
    updateDevice,
  } from "$lib/remote/devices.remote";
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
      
      {#each updateDeviceEnabled.fields.enabled.issues() as issue}
      <span class="issue">{issue.message}</span>
      {/each}
    </label>
    {/snippet}
    -->

<div id="page">
  <svelte:boundary>
    <Popup bind:open={showPopup}>
      <form {...updateDevice} style="padding: 0.4rem">
        <div class="form-item">
          <label for="name">name</label>
          <input {...updateDevice.fields.name.as("text")} />
          {#each updateDevice.fields.name.issues() as issue}
            <span class="issue">{issue.message}</span>
          {/each}
        </div>
        <div class="form-item-row">
          <label for="enabled">enabled</label>
          <input {...updateDevice.fields.enabled.as("checkbox")} />
          {#each updateDevice.fields.enabled.issues() as issue}
            <span class="issue">{issue.message}</span>
          {/each}
        </div>

        <div class="form-item">
          <label for="driverName">driverName</label>
          <select {...updateDevice.fields.driverName.as("select")}>
            {#each await getAvalibleDrivers() as option}
              <option value={option.id}>{option.displayName}</option>
            {/each}
          </select>
          {#each updateDevice.fields.driverName.issues() as issue}
            <span class="issue">{issue.message}</span>
          {/each}
        </div>

        {#if updateDevice.fields.driverName.value() == "ModbusTCPDriver"}
          <div class="form-item">
            <label for="unitId">unitId</label>
            <input {...updateDevice.fields.options.unitId.as("number")} />
            {#each updateDevice.fields.options.unitId.issues() as issue}
              <span class="issue">{issue.message}</span>
            {/each}
          </div>

          <div class="form-item-row">
            <label for="spanGaps">spanGaps</label>
            <input {...updateDevice.fields.options.spanGaps.as("checkbox")} />
            {#each updateDevice.fields.options.spanGaps.issues() as issue}
              <span class="issue">{issue.message}</span>
            {/each}
          </div>

          <div class="form-item">
            <label for="ip">ip</label>
            <input {...updateDevice.fields.options.ip.as("text")} />
            {#each updateDevice.fields.options.ip.issues() as issue}
              <span class="issue">{issue.message}</span>
            {/each}
          </div>

          <div class="form-item">
            <label for="port">port</label>
            <input {...updateDevice.fields.options.port.as("number")} />
            {#each updateDevice.fields.options.port.issues() as issue}
              <span class="issue">{issue.message}</span>
            {/each}
          </div>

          <div class="form-item">
            <label for="pollingIntervalMs">pollingIntervalMs</label>
            <input
              {...updateDevice.fields.options.pollingIntervalMs.as("number")}
            />
            {#each updateDevice.fields.options.pollingIntervalMs.issues() as issue}
              <span class="issue">{issue.message}</span>
            {/each}
          </div>

          <div class="form-item">
            <label for="reconnectInervalMs">reconnectInervalMs</label>
            <input
              {...updateDevice.fields.options.reconnectInervalMs.as("number")}
            />
            {#each updateDevice.fields.options.reconnectInervalMs.issues() as issue}
              <span class="issue">{issue.message}</span>
            {/each}
          </div>

          <div class="form-item">
            <label for="startAddress">startAddress</label>
            <input {...updateDevice.fields.options.startAddress.as("number")} />
            {#each updateDevice.fields.options.startAddress.issues() as issue}
              <span class="issue">{issue.message}</span>
            {/each}
          </div>

          <div class="form-item">
            <label for="endian">endian</label>
            <select {...updateDevice.fields.options.endian.as("select")}>
              <option value="BigEndian">Big Endian</option>
              <option value="LittleEndian">Little Endian</option>
            </select>
            {#each updateDevice.fields.options.endian.issues() as issue}
              <span class="issue">{issue.message}</span>
            {/each}
          </div>
        {:else if updateDevice.fields.driverName.value() == "ModbusRTUDriver"}
          <div class="form-item">
            <label for="serialPort">serial port</label>
            <input {...updateDevice.fields.options.serialPort.as("text")} />
            {#each updateDevice.fields.options.serialPort.issues() as issue}
              <span class="issue">{issue.message}</span>
            {/each}
          </div>

          <div class="form-item">
            <label for="baudRate">baudRate</label>
            <input {...updateDevice.fields.options.baudRate.as("number")} />
            {#each updateDevice.fields.options.baudRate.issues() as issue}
              <span class="issue">{issue.message}</span>
            {/each}
          </div>

          <div class="form-item">
            <label for="parity">parity</label>
            <select {...updateDevice.fields.options.parity.as("string")}>
              {#each ["none", "even", "odd"] as option}
                <option value={option}>{option}</option>
              {/each}
            </select>
            {#each updateDevice.fields.options.parity.issues() as issue}
              <span class="issue">{issue.message}</span>
            {/each}
          </div>

          <div class="form-item">
            <label for="unitId">unitId</label>
            <input {...updateDevice.fields.options.unitId.as("number")} />
            {#each updateDevice.fields.options.unitId.issues() as issue}
              <span class="issue">{issue.message}</span>
            {/each}
          </div>

          <div class="form-item-row">
            <label for="spanGaps">spanGaps</label>
            <input {...updateDevice.fields.options.spanGaps.as("checkbox")} />
            {#each updateDevice.fields.options.spanGaps.issues() as issue}
              <span class="issue">{issue.message}</span>
            {/each}
          </div>

          <div class="form-item">
            <label for="pollingIntervalMs">pollingIntervalMs</label>
            <input
              {...updateDevice.fields.options.pollingIntervalMs.as("number")}
            />
            {#each updateDevice.fields.options.pollingIntervalMs.issues() as issue}
              <span class="issue">{issue.message}</span>
            {/each}
          </div>

          <div class="form-item">
            <label for="startAddress">startAddress</label>
            <input {...updateDevice.fields.options.startAddress.as("number")} />
            {#each updateDevice.fields.options.startAddress.issues() as issue}
              <span class="issue">{issue.message}</span>
            {/each}
          </div>

          <div class="form-item">
            <label for="endian">endian</label>
            <select {...updateDevice.fields.options.endian.as("select")}>
              <option value="BigEndian">Big Endian</option>
              <option value="LittleEndian">Little Endian</option>
            </select>
            {#each updateDevice.fields.options.endian.issues() as issue}
              <span class="issue">{issue.message}</span>
            {/each}
          </div>
        {/if}

        <button type="submit" class="primary">save</button>

        {#each updateDevice.fields.allIssues() as issue}
          <span class="issue">{issue.message}</span>
        {/each}
      </form>
    </Popup>

    {#each await getDevices({}) as device}
      <div class="device">
        <!--
          <pre>
            {JSON.stringify(device, null, 2)}
          </pre>
          <h4>{device.name}</h4>
          -->
        <h2>{device.name}</h2>
        <h4>{device.options.driverName}</h4>
        <div class="status">
          <svg viewBox="0 0 100 100" class={device.status}>
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
              
              {#each updateDeviceEnabled.fields.enabled.issues() as issue}
              <span class="issue">{issue.message}</span>
              {/each}
            </div>
            
            {#each updateDeviceEnabled.fields.allIssues() as issue}
            <span class="issue">{issue.message}</span>
            {/each}
            
          </form>
        -->

        <div class="form-item">
          <a href="devices/{device.name}" tabindex="-1">
            <button class="secondary">edit </button>
          </a>
        </div>
        <!--
        <form {...updateDevice}>
          <label>
            <input {...updateDevice.fields.name.as("text")} />
            name
            </label>
            {#each updateDevice.fields.name.issues() as issue}
            <span class="issue">{issue.message}</span>
            {/each}
            
          {#each updateDevice.fields.allIssues() as issue}
          <span class="issue">{issue.message}</span>
          {/each}
          </form>
          -->
      </div>
    {/each}

    <button type="button" id="add-device" onclick={() => (showPopup = true)}>
      <svg viewBox="0 0 100 100">
        <g stroke-width="4px" fill="transparent">
          <rect x="10" y="10" width="80" height="80"></rect>
          <line x1="50" y1="10" x2="50" y2="90"></line>
          <line x1="70" y1="10" x2="70" y2="90"></line>
          <circle r="1" cx="80" cy="30"></circle>
          <circle r="1" cx="80" cy="20"></circle>
          <circle r="1" cx="60" cy="30"></circle>
          <circle r="1" cx="60" cy="20"></circle>
          <line x1="30" y1="40" x2="30" y2="60"></line>
          <line x1="20" y1="50" x2="40" y2="50"></line>
        </g>
      </svg>
      new device
    </button>

    {#snippet pending()}
      <p>loading...</p>
    {/snippet}
    {#snippet failed(error, reset)}
      <p>{error}</p>
      <button onclick={reset} class="primary">oops! try again</button>
    {/snippet}
  </svelte:boundary>
</div>

<style>
  h2,
  h4 {
    margin: 0;
  }

  #page {
    display: grid;
    gap: 1rem;
    padding: 1rem;
    max-width: 60rem;
    margin: 0 auto;
    grid-template-columns: repeat(auto-fit, minmax(30ch, 1fr));
  }

  #add-device {
    background-color: transparent;
    padding: 0.4rem;
    border: none;
    display: flex;
    align-items: center;
    gap: 1rem;
    margin: 0 auto;
    svg {
      width: 2rem;
      stroke: var(--app-text-color);
    }
  }
  .device {
    display: grid;
    gap: 1rem;
    border: 0.1rem solid var(--app-color-neutral-600);
    border-radius: 0.6rem;
    padding: 1rem;
    /*min-width: fit-content;*/
  }

  form {
    display: grid;
    gap: 1rem;
    padding: 1rem 0;
  }

  .status {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 1.5ch;

    svg {
      fill: var(--app-color-state-off);
      stroke: var(--app-color-neutral-000);
      width: 1rem;
    }

    .Connected {
      fill: var(--app-color-state-on);
    }

    .Reconnecting {
      fill: var(--app-color-state-warn);
      animation: blink-animation 1s linear infinite;
    }
  }
</style>
