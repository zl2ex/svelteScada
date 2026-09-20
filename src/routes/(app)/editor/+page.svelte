<script lang="ts">
  import TagInput from "$lib/client/componets/scada/TagInput.svelte";
</script>

<div id="editor">
  <svelte:boundary>
    <TagInput id="8ecb06c5-2a87-44fb-97d6-33520beb7751"></TagInput>
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
</style>
