<script lang="ts">
  import { dev } from "$app/environment";
  import { invalidate, invalidateAll } from "$app/navigation";
  import { page } from "$app/state";
  import Checkbox from "$lib/client/componets/Checkbox.svelte";
  import {
    getDevices,
    updateDevice,
    updateDeviceEnabled,
  } from "$lib/remote/devices.remote";
  import { onMount } from "svelte";

  let devices = getDevices({});

  function poll() {
    devices.refresh(); // get device status every 2 seconds
    setTimeout(poll, 2000);
  }

  function updateDeviceEnabledSubmit(name: string) {
    let form = document.querySelector(`#${name}`);
    console.log(form);
    if (form instanceof HTMLFormElement) {
      form.requestSubmit();
    } else {
      console.error(`updateDeviceEnabledSubmit(${name}) form undefined`);
    }
  }

  onMount(() => {
    poll();
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
    {#each await devices as device}
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

          <!--
          <button type="submit" class="primary">submit</button>
            <Checkbox
            name="test"
            bind:checked={updateDeviceEnabled.fields.enabled}
            ></Checkbox>
            -->
        </form>

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
  .device {
    display: grid;
    gap: 1rem;
    border: 0.2rem solid var(--app-color-neutral-600);
    border-radius: 1rem;
    padding: 1rem;
    margin: 1rem;
    width: fit-content;
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
