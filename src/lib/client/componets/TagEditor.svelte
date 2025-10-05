<script lang="ts">
  import { ClientTag } from "../tag/tagState.svelte";

  type props = {
    path: string;
  };

  let { path }: props = $props();

  let tag: ClientTag<any>;

  async function getTagData() {
    const tag = new ClientTag("any", { path });
    tag.subscribe();
    return tag;
  }
</script>

<svelte:boundary>
  {#await getTagData()}
    <p>Loading data...</p>
  {:then tag}
    <p>Name: {tag.name}</p>
    <p>Value: {tag.value}</p>
  {:catch error}
    <p>Error: {error.message}</p>
  {/await}
</svelte:boundary>
