<script lang="ts">
  import type { NeverThrowError } from "$lib/util/neverThrow";
  import type { HTMLAttributes } from "svelte/elements";
  import NeverThrowErrorDisplay from "$lib/client/componets/NeverThrowErrorDisplay.svelte";

  interface Props extends HTMLAttributes<HTMLParagraphElement> {
    error: NeverThrowError;
    class?: string;
  }

  let { error, class: clazz, ...rest }: Props = $props();
</script>

<p class={"heading-font-weight " + clazz} {...rest}>{error.reason}</p>
{#if typeof error.cause === "string"}
  <p class={clazz} {...rest}>{error.cause}</p>
{:else if typeof error.cause === "object"}
  <NeverThrowErrorDisplay error={error.cause} class={clazz} {...rest} />
{/if}
