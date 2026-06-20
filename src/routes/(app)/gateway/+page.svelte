<script lang="ts">
</script>

<div class="grid grid-flow-col gap-2">
  <svelte:boundary>
    <h2 class="h2">Gateway Home</h2>
    {#snippet pending()}
      <p>loading...</p>
    {/snippet}
    {#snippet failed(error, reset)}
      <p>{error}</p>
      <button onclick={reset} class="btn">oops! try again</button>
    {/snippet}
  </svelte:boundary>
</div>
