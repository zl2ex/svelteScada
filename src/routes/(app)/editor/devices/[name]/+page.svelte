<script lang="ts">
  import { page } from "$app/state";
  import {
    getAvalibleDrivers,
    getDevice,
    updateDevice,
  } from "$lib/remote/devices.remote";
  import { optional } from "zod";

  let device = await getDevice(page.params.name ?? "");

  updateDevice.fields.set({
    name: device.name,
    driverName: device.options.driverName,
    options: device.options.options,
    enabled: device.options.enabled,
  });
</script>

<div id="page">
  <svelte:boundary>
    <form
      {...updateDevice.enhance(({ form, data, submit }) => {
        submit();
      })}
    >
      <h2>Edit Device</h2>
      <div class="form-item">
        <label for="name">name</label>
        <input {...updateDevice.fields.name.as("text")} />
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
      {:else if updateDevice.fields.driverName.value() == "ModbusRTUDriver"}{/if}

      <button type="submit" class="primary">submit</button>

      {#each updateDevice.fields.allIssues() as issue}
        <span class="issue">{issue.message}</span>
      {/each}
    </form>

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
    width: clamp(25ch, 40%, 50ch);
  }
</style>
