<script lang="ts">
  import { socketIoClientHandler } from "$lib/client/socket.io/socket.io.svelte";
  import {
    ClientTag,
    Node,
    type ClientTagOptions,
  } from "$lib/client/tag/clientTag.svelte";
  import { deleteTag, updateTag } from "$lib/remote/tags.remote";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import Label from "$lib/client/componets/scada/Label.svelte";
  import type { TagOptionsInput } from "$lib/server/tag/tag";

  let tagEditorPath = $derived(page.url.searchParams.get("tagPath") ?? "/");
  let parentPath = $derived(page.url.searchParams.get("parentPath") ?? "/");

  let newTagOptions = $derived({
    name: "newTag",
    path: `${parentPath}"newTag"`,
    parentPath: parentPath,
  } satisfies ClientTagOptions);

  let existingTag = $derived.by(async () => {
    if (tagEditorPath == "newTag") {
      //let tag = new ClientTag("any", tagOptions);
      //updateTag.fields.set(tagOptions);
      //updateTag.fields.parentPath.set(tagOptions.parentPath);
      //updateTag.fields.path.set()
      // return newTag;

      let tag = new ClientTag("any", newTagOptions);
      await tag.subscribe().catch((reason) => {
        console.error(reason);
      });
      updateTag.fields.set(newTagOptions);
      return tag;
    } else {
      let tag = new ClientTag("any", { path: tagEditorPath });
      await tag.subscribe();
      updateTag.fields.set(tag.options);
      return tag;
    }
  });

  /*
  $effect.pre(() => {
    if (tagEditorPath == "newTag") {
      let tagOptions = {
        name: "newTag",
        dataType: "Double",
        parentPath: parentPath,
      } satisfies TagOptionsInput<any>;
      updateTag.fields.set(tagOptions.options);
      //updateTag.fields.parentPath.set(tagOptions.parentPath);
    } else {
      updateTag.fields.set(newTag.options);
    }
  });*/
</script>

<div id="tagEditor">
  <svelte:boundary>
    <div class="container">
      {#await existingTag then tag}
        <form
          {...updateTag.enhance(async ({ form, data, submit }) => {
            await submit();
            let node = new Node({ ...data, type: "Tag" });
            goto(`?tagPath=${node.path}`);
            /*
            // force reload of newTag $derrived on submit
            let oldTagEditorPath = tagEditorPath;
            tagEditorPath = "";
            tagEditorPath = oldTagEditorPath;*/
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
            {...updateTag.fields.parentPath.as(
              "hidden",
              tag.options.parentPath
            )}
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
            <button type="submit" class="primary">save</button>
            <button
              type="button"
              class="secondary"
              onclick={async () => {
                await deleteTag(tag.path);
                goto("/editor/tags");
              }}>delete</button
            >
          </div>

          <div class="form-item">
            {#each updateTag.fields.issues() as issue}
              <span class="issue">{issue.message}</span>
            {/each}
            {#if tag.errorMessage}
              <span class="issue">{tag.errorMessage}</span>
            {/if}
          </div>
        </form>

        <div class="form-item">
          <Label path={tagEditorPath} label="value"></Label>
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

    form {
      display: grid;
      gap: 1rem;
    }
  }
</style>
