<script lang="ts">
  import { ClientTag } from "$lib/client/tag/tagState.svelte";
  import type { TagPaths } from "$lib/server/tag/tag";
  import { socketIoClientHandler } from "$lib/client/socket.io/socket.io.svelte";
  import { updateTag } from "$lib/remote/tags.remote";

  type props = {
    tagPath: TagPaths;
  };

  let { tagPath }: props = $props();

  //let tag = new ClientTag("any", { path: tagPath });

  async function getClientTag(tagPath: string) {
    let tag = new ClientTag("any", { path: tagPath });
    await tag.subscribe();
    updateTag.fields.set({
      name: tag.name,
      dataType: tag.dataType,
      path: tag.path,
      nodeId: tag.nodeId,
      parentPath: tag.parentPath,
      parameters: tag.parameters,
      initialValue: tag.value,
      exposeOverOpcua: tag.exposeOverOpcua,
    });
    return tag;
  }

  let tag = $derived(await getClientTag(tagPath));
  /*
  $effect.root(() => {
    return () => {
      alert(`unsubscribe ${tag.path}`);
      tag.unsubscribe(); // unsibscribe when unmounted
    };
  });*/
</script>

<svelte:boundary>
  <div>
    {#if tag.error}
      <p>{tag.error.message}</p>
      <p>{tag.error.feildName}</p>
    {:else if tag.errorMessage}
      <p>{tag.errorMessage}</p>
    {:else if updateTag.result?.error}
      <p>{updateTag.result.error}</p>
    {/if}
    <form
      {...updateTag.enhance(async ({ form, data, submit }) => {
        try {
          await submit();
          tag = await getClientTag(tagPath);
          // form.reset();
        } catch (error) {
          alert(error);
        }
      })}
    >
      <label>
        name
        <input {...updateTag.fields.name.as("text")} />
      </label>
      <input {...updateTag.fields.path.as("hidden", tag.path)} />
      <input {...updateTag.fields.parentPath.as("hidden", tag.parentPath)} />

      <!--<datalist id="dataTypeAutocomplete">
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
          <input {...updateTag.fields.dataType.as("text")} />-->
      <select {...updateTag.fields.dataType.as("select")} autocomplete="on">
        {#await socketIoClientHandler.rpc( { name: "getDataTypeStrings()", parameters: {} } ) then options}
          {#if options.error}
            <p>Error {options.error.message}</p>
          {:else}
            {#each options.data as option}
              <option value={option}>{option}</option>
            {/each}
          {/if}
        {/await}
      </select>
      <label>
        nodeId
        <input {...updateTag.fields.nodeId.as("text")} />
      </label>

      <label>
        exposeOverOpcua
        <input {...updateTag.fields.exposeOverOpcua.as("checkbox")} />
      </label>
      <label>
        writeable
        <input {...updateTag.fields.writeable.as("checkbox")} />
      </label>
      <button class="primary">submit</button>
    </form>
    {#if typeof tag.value === "boolean"}
      <input
        type="checkbox"
        checked={tag.value}
        oninput={(ev) => {
          tag.write(Boolean(ev.target?.checked));
        }}
      />
    {:else if typeof tag.value === "number"}
      <input
        type="number"
        value={tag.value}
        oninput={(ev) => {
          console.log(ev.target.value);
          tag.write(Number(ev.target.value));
        }}
      />
    {:else if typeof tag.value === "string"}
      <input
        type="text"
        value={tag.value}
        oninput={(ev) => {
          tag.write(String(ev.target?.value));
        }}
      />
    {:else if typeof tag.value === "object" && tag.value}
      {#each Object.entries(tag.value) as [key, value]}
        {#if typeof tag.value === "boolean"}
          <input
            type="checkbox"
            checked={tag.value}
            oninput={(ev) => {
              tag.write(Boolean(ev.target?.checked));
            }}
          />
        {:else if typeof tag.value === "number"}
          <input
            type="number"
            value={tag.value}
            oninput={(ev) => {
              tag.write(Number(ev.target?.value));
            }}
          />
        {:else if typeof tag.value === "string"}
          <input
            type="text"
            value={tag.value}
            oninput={(ev) => {
              tag.write(String(ev.target?.value));
            }}
          />
        {/if}
      {/each}
    {:else}
      unsupported type {typeof tag.value}
    {/if}
  </div>

  {#snippet pending()}
    <p>loading...</p>
  {/snippet}
  {#snippet failed(error, reset)}
    <p>{error}</p>
    <button onclick={reset} class="primary">oops! try again</button>
  {/snippet}
</svelte:boundary>

<style>
  div {
    display: flex;
    flex-direction: row;
    flex: 0;
    width: fit-content;
    border: 3px solid brown;
    padding: 1rem;
  }
  input[type="number"] {
    width: 6rem;
  }
</style>
