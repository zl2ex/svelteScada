<script lang="ts" module>
  import type { HTMLLabelAttributes } from "svelte/elements";
  import type { RemoteFormField } from "@sveltejs/kit";
  import { getFeildContext } from "../modules/context.svelte";

  export interface RemoteFormLabelProps extends HTMLLabelAttributes {}
</script>

<script lang="ts">
  let { children, ...rest }: RemoteFormLabelProps = $props();
  let feild = getFeildContext() as RemoteFormField<any>;
  let feildAs = feild.as("text");
</script>

<label class="label" for={feildAs.name} aria-label={feildAs.name} {...rest}>
  {#if children}
    {@render children()}
  {:else}
    {feildAs.name}
  {/if}
</label>
