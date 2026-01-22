<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { getUdt, updateUdt } from "$lib/remote/udts.remote";
  import type { UdtDefinitionOptions } from "$lib/server/tag/udt";

  let newUdtOptions = {
    name: "newUdt",
    feilds: [
      {
        name: "newTag",
        parentPath: "",
        dataType: "Double",
      },
    ],
    parameters: {},
  } satisfies UdtDefinitionOptions;

  let tagEditorPath = $derived(page.url.searchParams.get("udtName") ?? "");
  let udtDefinition = $derived(
    (await getUdt(tagEditorPath).catch(() => {
      return undefined; /*TD WIP Workaroud for this error :   UnhandledPromiseRejection: This error originated either by throwing inside of an async function without a catch block, or by rejecting a promise which was not handled with .catch(). The promise rejected with the reason "[object Object]".
    at throwUnhandledRejectionsMode (node:internal/process/promises:392:7)
    at processPromiseRejections (node:internal/process/promises:475:17)
    at processTicksAndRejections (node:internal/process/task_queues:106:32)*/
    })) ?? newUdtOptions
  );
</script>

<div id="tagEditor">
  <svelte:boundary>
    <pre>{JSON.stringify(udtDefinition, null, 2)}</pre>
    <div class="container">
      <form
        {...updateUdt.enhance(async ({ form, data, submit }) => {
          await submit();
          goto(`?udtName=${udtDefinition.name}`);
          /*
            // force reload of newTag $derrived on submit
            let oldTagEditorPath = tagEditorPath;
            tagEditorPath = "";
            tagEditorPath = oldTagEditorPath;*/
        })}
      >
        <div class="form-item">
          <label for="name">name</label>
          <input
            {...updateUdt.fields.name.as("text")}
            value={udtDefinition.name}
          />
          {#each updateUdt.fields.name.issues() as issue}
            <span class="issue">{issue.message}</span>
          {/each}
        </div>

        {#each udtDefinition.feilds as feild}
          <div class="form-item">
            <label for="name">name</label>
            <input
              {...updateUdt.fields.feilds[0].name.as("text")}
              value={feild.name}
            />
            {#each updateUdt.fields.name.issues() as issue}
              <span class="issue">{issue.message}</span>
            {/each}
          </div>
        {/each}

        <!-- <datalist id="dataTypeAutocomplete">
            {#await socketIoClientHandler.rpc( { name: "getDataTypeStrings()", parameters: {} } ) then options}
              {#if options.error}
              <p>Error {options.error.message}</p>
              {:else}
              {#each options.data as option}
              <option value={option}>{option}</option>
              {/each}
              {/if}
              {/await}
          </datalist>
          <label for="dataType">dataType</label>
          <input {...updateUdt.fields.dataType.as("text")} /> -->
      </form>
    </div>

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
  #tagEditor {
    flex-grow: 1;
    height: var(
      --app-main-content-height
    ); /*space for the header  has to have a height for overflow-y: auto*/
    overflow-y: auto;
    overflow-x: hidden;

    .container {
      padding: 1rem;
      max-width: 30ch;
      margin: 0 auto;
    }

    .override {
      border-right: 0.5rem solid var(--app-color-state-on);
      border-left: 0.5rem solid var(--app-color-state-on);
    }

    form {
      display: grid;
      gap: 1rem;
    }
  }
</style>
