<script lang="ts">
  import type { RemoteFormField } from "@sveltejs/kit";
  import { setContext, type Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";

  type props = {
    children?: Snippet<[]>;
    remoteFormFeild: RemoteFormField<any>;
    rest?: HTMLAttributes<HTMLDivElement>;
  };

  let { children, remoteFormFeild, ...rest }: props = $props();

  setContext("remoteFormFeild", {
    get remoteFormFeild() {
      return remoteFormFeild;
    },
  });
</script>

<div {...rest}>
  {@render children?.()}
</div>
