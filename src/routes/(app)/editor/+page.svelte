<script lang="ts">
  import { socketIoClientHandler } from "$lib/client/socket.io/socket.io.svelte";
  import {
    ClientTag,
    type ClientTagOptions,
  } from "$lib/client/tag/clientTag.svelte";
  import { updateTag } from "$lib/remote/tags.remote";
  import { page } from "$app/state";
  import RemoteForm from "$lib/client/componets/remoteFormElements/RemoteForm/index";

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
      //updateTag.fields.set(newTagOptions);
      return tag;
    } else {
      let tag = new ClientTag("any", { path: tagEditorPath });
      await tag.subscribe().catch((reason) => {
        console.error(reason);
      });
      //updateTag.fields.set(tag.options);
      updateTag.fields.dataType.set(tag.options.dataType);
      return tag;
    }
  });
</script>

<div id="tagEditor">
  <svelte:boundary>
    <form {...updateTag}>
      <RemoteForm feild={updateTag.fields.name}>
        <RemoteForm.Label></RemoteForm.Label>
        <RemoteForm.Input as="text" />
        <RemoteForm.Issue />
      </RemoteForm>

      <RemoteForm feild={updateTag.fields.exposeOverOpcua}>
        <RemoteForm.Checkbox />
        <RemoteForm.Issue />
      </RemoteForm>

      <button type="submit" class="btn preset-filled">submit</button>
    </form>

    {#snippet pending()}
      <p>loading...</p>
    {/snippet}
    {#snippet failed(error, reset)}
      <p>{error}</p>
      <button onclick={reset} class="btn preset-filled">reset</button>
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
      outline: 0.2rem solid var(--app-color-state-on);
    }

    form {
      display: grid;
      gap: 1rem;
    }
  }
</style>
