<script lang="ts">
  import { ClientTag } from "$lib/client/tag/tagState.svelte";

  type props = {
    tagPath: string;
  };

  let { tagPath }: props = $props();

  let tag = new ClientTag("number", { path: tagPath });

  $effect.root(() => {
    tag.subscribe();
    return () => {
      tag.unsubscribe(); // unsibscribe when unmounted
    };
  });
</script>

<div>
  <h2>{tag.path}</h2>
  <h3>{tag.name}</h3>
  <table>
    <tbody>
      <!--{@html tableContent}-->
      {#if typeof tag.value === "boolean"}
        <tr
          ><td
            ><input
              type="checkbox"
              checked={tag.value}
              oninput={(ev) => {
                tag.write(Boolean(ev.target?.checked));
              }}
            /></td
          ></tr
        >
      {:else if typeof tag.value === "number"}
        <tr
          ><td
            ><input
              type="number"
              value={tag.value}
              oninput={(ev) => {
                tag.write(Number(ev.target?.value));
              }}
            /></td
          ></tr
        >
      {:else if typeof tag.value === "string"}
        <tr
          ><td
            ><input
              type="text"
              value={tag.value}
              oninput={(ev) => {
                tag.write(String(ev.target?.value));
              }}
            /></td
          ></tr
        >
      {:else if typeof tag.value === "object" && tag.value}
        {#each Object.entries(tag.value) as [key, value]}
          <tr>
            {#if typeof value === "boolean"}
              <td>{key}</td>
              <td
                ><input
                  type="checkbox"
                  checked={value}
                  oninput={(ev) => {
                    tag.write(Boolean(ev.target?.checked));
                  }}
                /></td
              >
            {:else if typeof value === "number"}
              <td>{key}</td>
              <td
                ><input
                  type="number"
                  {value}
                  oninput={(ev) => {
                    tag.write(Number(ev.target?.value));
                  }}
                /></td
              >
            {:else if typeof value === "string"}
              <td>{key}</td>
              <td
                ><input
                  type="text"
                  {value}
                  oninput={(ev) => {
                    tag.write(String(ev.target?.value));
                  }}
                /></td
              >
            {/if}
          </tr>
        {/each}
      {:else}
        <td>unsupported type {typeof tag.value}</td>
      {/if}
    </tbody>
  </table>
</div>

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
