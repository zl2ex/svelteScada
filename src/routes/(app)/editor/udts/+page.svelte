<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { deleteUDt, getUdt, updateUdt } from "$lib/remote/udts.remote";
  import type { UdtDefinitionOptions } from "$lib/server/tag/udt";

  let newUdtOptions = {
    name: "newUdt",
    feilds: [
      {
        name: "newTag",
        parentPath: "",
        dataType: "Double",
        nodeId: "",
        exposeOverOpcua: false,
        children: {},
        parameters: {},
        writeable: true,
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
    })) ?? newUdtOptions,
  );
</script>

<div id="tagEditor">
  <svelte:boundary>
    <pre>{JSON.stringify(udtDefinition, null, 2)}</pre>
    <div class="container">
      <form
        {...updateUdt.enhance(async ({ submit }) => {
          submit();
          goto(`?udtName=${udtDefinition.name}`);
        })}
      >
        <div class="form-item">
          <label for="name">name</label>
          <input
            {...updateUdt.fields.name.as("text")}
            value={udtDefinition.name}
          />
          {#each updateUdt.fields.name.issues() ?? [] as issue}
            <span class="text-error-600-400">{issue.message}</span>
          {/each}
        </div>

        {#each udtDefinition.feilds as feild}
          <div class="tag">
            <div class="form-item">
              <label for="name">name</label>
              <input
                {...updateUdt.fields.feilds[0].name.as("text")}
                value={feild.name}
              />
              {#each updateUdt.fields.feilds[0].name.issues() ?? [] as issue}
                <span class="text-error-600-400">{issue.message}</span>
              {/each}
            </div>

            <!--<input {...updateUdt.fields.feilds[0].path.as("hidden", tag.path)} />
          <input
            {...updateUdt.fields.feilds[0].parentPath.as(
              "hidden",
              tag.options.parentPath
            )}
            />-->

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
          <input {...updateUdt.fields.feilds[0].dataType.as("text")} /> -->

            <div class="form-item">
              <label for="dataType">data type</label>
              <select
                {...updateUdt.fields.feilds[0].dataType.as("select")}
                value={feild.dataType}
                autocomplete="on"
              >
                {#await socketIoClientHandler.rpc( { name: "getDataTypeStrings()", parameters: {} }, ) then options}
                  {#if options.error}
                    <span class="text-error-600-400"
                      >Error {options.error.message}</span
                    >
                  {:else}
                    {#each options.data as option}
                      <option value={option}>{option}</option>
                    {/each}
                  {/if}
                {/await}
              </select>
              {#each updateUdt.fields.feilds[0].dataType.issues() ?? [] as issue}
                <span class="text-error-600-400">{issue.message}</span>
              {/each}
            </div>

            <div class="form-item">
              <label for="nodeId">nodeId</label>
              <input
                {...updateUdt.fields.feilds[0].nodeId.as("text")}
                value={feild.nodeId}
              />
              {#each updateUdt.fields.feilds[0].nodeId.issues() ?? [] as issue}
                <span class="text-error-600-400">{issue.message}</span>
              {/each}
            </div>

            <div class="form-item-row">
              <label for="exposeOverOpcua">exposeOverOpcua</label>
              <input
                {...updateUdt.fields.feilds[0].exposeOverOpcua.as("checkbox")}
                checked={feild.exposeOverOpcua}
              />
              {#each updateUdt.fields.feilds[0].exposeOverOpcua.issues() ?? [] as issue}
                <span class="text-error-600-400">{issue.message}</span>
              {/each}
            </div>

            <div class="form-item-row">
              <label for="writeable">writeable</label>
              <input
                {...updateUdt.fields.feilds[0].writeable.as("checkbox")}
                checked={feild.writeable}
              />
              {#each updateUdt.fields.feilds[0].writeable.issues() ?? [] as issue}
                <span class="text-error-600-400">{issue.message}</span>
              {/each}
            </div>

            <div class="form-item-row">
              <button
                type="button"
                class="secondary"
                onclick={async () => {
                  await deleteUDt(udtDefinition.name);
                  goto("/editor/udts");
                }}>delete</button
              >
            </div>

            <div class="form-item">
              {#each updateUdt.fields.feilds[0].issues() ?? [] as issue}
                <span class="text-error-600-400">{issue.message}</span>
              {/each}
            </div>
          </div>
        {/each}
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

    .tag {
      border: 0.1rem solid var(--app-color-neutral-600);
      padding: 0.5rem;
    }
  }
</style>
