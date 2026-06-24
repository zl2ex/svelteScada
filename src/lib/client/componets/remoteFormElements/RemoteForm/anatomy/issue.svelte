<script lang="ts" module>
  import type { HTMLBaseAttributes } from "svelte/elements";
  import type { RemoteFormField } from "@sveltejs/kit";
  import { getFeildContext } from "../modules/context.svelte";

  export interface RemoteFormIssueProps extends HTMLBaseAttributes {}
</script>

<script lang="ts">
  let { children, ...rest }: RemoteFormIssueProps = $props();
  let feild = getFeildContext() as RemoteFormField<string>;
</script>

{#each feild.issues() ?? [] as issue}
  <p class="text-error-300-700" {...rest}>{issue.message}</p>
{/each}
{@render children?.()}
