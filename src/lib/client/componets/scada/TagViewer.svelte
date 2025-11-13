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

  let tag = $state(await getClientTag(tagPath));
  /*
  $effect.root(() => {
    return () => {
      alert(`unsubscribe ${tag.path}`);
      tag.unsubscribe(); // unsibscribe when unmounted
    };
  });*/
</script>

<svelte:boundary>
  <div class="container">
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
          tag = getClientTag(tagPath);
          // form.reset();
        } catch (error) {
          alert(error);
        }
      })}
    >
      <div class="form-item">
        <label for="name">name</label>
        <input {...updateTag.fields.name.as("text")} />
        {#each updateTag.fields.name.issues() as issue}
          <span class="issue">{issue.message}</span>
        {/each}
      </div>
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

      <div class="form-item">
        <label for="dataType">data type</label>
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
        {#each updateTag.fields.dataType.issues() as issue}
          <span class="issue">{issue.message}</span>
        {/each}
      </div>

      <div class="form-item">
        <label for="nodeId">nodeId</label>
        <input {...updateTag.fields.nodeId.as("text")} />
        {#each updateTag.fields.nodeId.issues() as issue}
          <span class="issue">{issue.message}</span>
        {/each}
      </div>

      <div class="form-item-row">
        <label for="exposeOverOpcua">exposeOverOpcua</label>
        <input {...updateTag.fields.exposeOverOpcua.as("checkbox")} />
        {#each updateTag.fields.exposeOverOpcua.issues() as issue}
          <span class="issue">{issue.message}</span>
        {/each}
      </div>

      <div class="form-item-row">
        <label for="writeable">writeable</label>
        <input {...updateTag.fields.writeable.as("checkbox")} />
        {#each updateTag.fields.writeable.issues() as issue}
          <span class="issue">{issue.message}</span>
        {/each}
      </div>

      <div class="form-item-row">
        <button class="primary">save</button>
      </div>
    </form>

    <div class="form-item">
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
  .container {
    padding: 1rem;
    max-width: 30ch;
    margin: 0 auto;
  }

  form {
    display: grid;
    gap: 1rem;
  }
</style>
