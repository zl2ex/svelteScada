<script lang="ts">
  import TreeNode from "$lib/client/componets/TreeNode.svelte";
  import { socketIoClientHandler } from "$lib/client/socket.io/socket.io.svelte";
  import { ClientTag } from "$lib/client/tag/tagState.svelte";
  import { updateTag } from "$lib/remote/tags.remote";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import Label from "$lib/client/componets/scada/Label.svelte";
  import { onMount } from "svelte";

  let tagEditorPath = $state(page.url.searchParams.get("tagPath") ?? "/");

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
      writeable: tag.writeable,
    });
    return tag;
  }

  let newTag = $derived(getClientTag(tagEditorPath));
</script>

<div id="page">
  <div id="treeBrowser">
    <!--<input type="text" bind:value={tagEditorPath} />-->
    <svelte:boundary>
      <TreeNode
        path={""}
        onclick={(path) => {
          tagEditorPath = path;
          goto(`?tagPath=${tagEditorPath}`);
        }}
      ></TreeNode>

      {#snippet pending()}
        <p>loading...</p>
      {/snippet}
      {#snippet failed(error, reset)}
        <p>{error}</p>
        <button onclick={reset} class="primary">oops! try again</button>
      {/snippet}
    </svelte:boundary>
  </div>
  <div id="tagEditor">
    <svelte:boundary>
      <div class="container">
        {#await newTag then tag}
          <form
            {...updateTag.enhance(async ({ form, data, submit }) => {
              await submit();
              // force reload of newTag $derrived on submit
              let oldTagEditorPath = tagEditorPath;
              tagEditorPath = "";
              tagEditorPath = oldTagEditorPath;
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
            <input
              {...updateTag.fields.parentPath.as("hidden", tag.parentPath)}
            />

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
          <input {...updateTag.fields.dataType.as("text")} /> -->

            <div class="form-item">
              <label for="dataType">data type</label>
              <select
                {...updateTag.fields.dataType.as("select")}
                autocomplete="on"
              >
                {#await socketIoClientHandler.rpc( { name: "getDataTypeStrings()", parameters: {} } ) then options}
                  {#if options.error}
                    <span class="issue">Error {options.error.message}</span>
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

            <div class="form-item">
              {#each updateTag.fields.issues() as issue}
                <span class="issue">{issue.message}</span>
              {/each}
              {#if tag.error}
                <span class="issue">{tag.error.message}</span>
                <span class="issue">{tag.error.feildName}</span>
              {:else if tag.errorMessage}
                <span class="issue">{tag.errorMessage}</span>
              {/if}
            </div>
          </form>

          <div class="form-item">
            <Label path={tag.path} label="value"></Label>
          </div>
        {/await}
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
</div>

<style>
  #page {
    display: flex;
  }

  #treeBrowser {
    flex-shrink: 0;
    height: var(
      --app-main-content-height
    ); /*space for the header  has to have a height for overflow-y: auto*/
    overflow-y: auto;
    overflow-x: hidden;
    background-color: var(--app-color-neutral-400);
    padding-left: 0.5rem;
    padding-right: 0.5rem;
  }

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

    form {
      display: grid;
      gap: 1rem;
    }
  }
</style>
