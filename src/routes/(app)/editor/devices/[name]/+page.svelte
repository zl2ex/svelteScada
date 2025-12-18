<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import {
    deleteDevice,
    getAvalibleDrivers,
    getDevice,
    updateDevice,
  } from "$lib/remote/devices.remote";
  import type { DeviceOptions } from "$lib/server/drivers/driver";

  let newDevice = $derived.by(async () => {
    let device = await getDevice(page.params.name ?? "");
    if (!device) {
      // create a new device
      device = {
        name: "new_Device",
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
    }

    /*
    updateDevice.fields.set({
      name: device.name,
      driverName: device.options.driverName,
      options: device.options.options,
      enabled: device.options.enabled,
    });*/

    return device;
  });
</script>

<div id="page">
  <svelte:boundary>
    {#await newDevice then device}
      <form
        {...updateDevice.enhance(({ form, data, submit }) => {
          submit();
        })}
      >
        <div class="form-item">
          <h2>{device.name}</h2>
          <input {...updateDevice.fields.name.as("hidden", device.name)} />
          {#each updateDevice.fields.driverName.issues() as issue}
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

        <div class="form-item-row">
          <button type="submit" class="primary">save</button>
          <button
            type="button"
            class="secondary"
            onclick={async () => {
              await deleteDevice(device.name);
              goto("/editor/devices");
            }}>delete</button
          >
        </div>

        {#each updateDevice.fields.allIssues() as issue}
          <span class="issue">{issue.message}</span>
        {/each}
      </form>
    {/await}

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
  #page {
    display: flex;
    justify-content: center;
  }

  form {
    display: grid;
    gap: 1rem;
    width: clamp(25ch, 50%, 40ch);
  }
</style>
