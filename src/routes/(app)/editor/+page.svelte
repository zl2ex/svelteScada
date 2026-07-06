<script lang="ts">
</script>

<div id="editor">
  <svelte:boundary>
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
