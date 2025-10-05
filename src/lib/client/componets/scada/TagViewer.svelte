<script lang="ts">
  import { ClientTag } from "$lib/client/tag/tagState.svelte";
  import type { TagPaths } from "$lib/server/tag/tag";

  type props = {
    tagPath: TagPaths;
  };

  let { tagPath }: props = $props();

  //let tag = new ClientTag("any", { path: tagPath });

  async function getClientTag(tagPath: string) {
    let tag = new ClientTag("any", { path: tagPath });
    await tag.subscribe();
    return tag;
  }

  /*
  $effect.root(() => {
    return () => {
      alert(`unsubscribe ${tag.path}`);
      tag.unsubscribe(); // unsibscribe when unmounted
    };
  });*/
</script>

<svelte:boundary>
  {#await getClientTag(tagPath) then tag}
    <tr>
      <td>{tag.name}</td>
      <td>{tag.dataType}</td>
      <!--{@html tableContent}-->
      {#if tag.error}
        <td>{tag.error.message}</td>
        <td>{tag.error.feildName}</td>
      {:else if tag.errorMessage}
        <p>{tag.errorMessage}</p>
      {:else}
        <!---->
        {#if typeof tag.value === "boolean"}
          <td>
            <input
              type="checkbox"
              checked={tag.value}
              oninput={(ev) => {
                tag.write(Boolean(ev.target?.checked));
              }}
            />
          </td>
        {:else if typeof tag.value === "number"}
          <td>
            <input
              type="number"
              value={tag.value}
              oninput={(ev) => {
                tag.write(Number(ev.target?.value));
              }}
            />
          </td>
        {:else if typeof tag.value === "string"}
          <td>
            <input
              type="text"
              value={tag.value}
              oninput={(ev) => {
                tag.write(String(ev.target?.value));
              }}
            />
          </td>
        {:else if typeof tag.value === "object" && tag.value}
          {#each Object.entries(tag.value) as [key, value]}
            {#if typeof tag.value === "boolean"}
              <td>
                <input
                  type="checkbox"
                  checked={tag.value}
                  oninput={(ev) => {
                    tag.write(Boolean(ev.target?.checked));
                  }}
                />
              </td>
            {:else if typeof tag.value === "number"}
              <td>
                <input
                  type="number"
                  value={tag.value}
                  oninput={(ev) => {
                    tag.write(Number(ev.target?.value));
                  }}
                />
              </td>
            {:else if typeof tag.value === "string"}
              <td>
                <input
                  type="text"
                  value={tag.value}
                  oninput={(ev) => {
                    tag.write(String(ev.target?.value));
                  }}
                />
              </td>
            {/if}
          {/each}
        {:else}
          <td>unsupported type {typeof tag.value}</td>
        {/if}
      {/if}
    </tr>
  {:catch error}
    <p>Error: {error.error.message}</p>
  {/await}
</svelte:boundary>

<style>
  div {
    display: flex;
    flex-direction: column;
    flex: 0;
    width: fit-content;
    border: 3px solid brown;
    padding: 1rem;
  }

  h3,
  h4,
  h5 {
    margin: 0;
  }

  input[type="number"] {
    width: 6rem;
  }
</style>
