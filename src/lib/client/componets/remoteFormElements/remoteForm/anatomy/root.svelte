<!--root.svelte-->
<script lang="ts" generics="T extends number | string | boolean">
  import type { RemoteFormField } from "@sveltejs/kit";
  import type { HTMLAttributes } from "svelte/elements";
  import { setFeildContext } from "../modules/context.svelte";
  interface RemoteFormRootProps extends HTMLAttributes<HTMLDivElement> {
    feild: RemoteFormField<T>;
  }
  let { children, feild, ...rest }: RemoteFormRootProps = $props();

  setFeildContext(feild);
</script>

<svelte:boundary>
  <div {...rest}>
    {@render children?.()}
  </div>

  {#snippet pending()}
    <p>loading...</p>
  {/snippet}
  {#snippet failed(error, reset)}
    <p class="text-error-300-700">{error}</p>
    <button onclick={reset} class="btn preset-filled">reset</button>
  {/snippet}
</svelte:boundary>
