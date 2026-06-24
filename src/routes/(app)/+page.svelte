<script lang="ts">
  import { increment, counter, tree } from "$live/counter";

  let cnt = counter.rune();
  let tre = tree.rune();
</script>

<h1>Home</h1>

<h1>svelte-realtime</h1>

{#if cnt.current === undefined}
  <p>Connecting...</p>
{:else}
  <p>Count: {cnt.current}</p>
{/if}

<button class="btn preset-outlined" onclick={() => increment()}>+1</button>

<pre class="pre">{JSON.stringify(tre.current, null, 2)}</pre>
