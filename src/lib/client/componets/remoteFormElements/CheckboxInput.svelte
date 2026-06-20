<script lang="ts">
  import { Switch } from "@skeletonlabs/skeleton-svelte";
  import type { RemoteFormField } from "@sveltejs/kit";
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";

  type props = {
    children?: Snippet<[]>;
    remoteFormFeild: RemoteFormField<boolean>;
    defaultValue?: boolean;
    label?: string;
    divAttr?: HTMLAttributes<HTMLDivElement>;
    labelAttr?: HTMLAttributes<HTMLSpanElement>;
    inputAttr?: HTMLAttributes<HTMLInputElement>;
  };

  let {
    children,
    remoteFormFeild,
    defaultValue,
    label,
    divAttr,
    inputAttr,
    labelAttr,
  }: props = $props();

  let feild = $derived(remoteFormFeild.as("checkbox"));

  $effect(() => {
    remoteFormFeild.set(defaultValue);
  });
</script>

<div {...divAttr}>
  {@render children?.()}

  <Switch {...feild}>
    <Switch.Control>
      <Switch.Thumb />
    </Switch.Control>
    <Switch.HiddenInput {...inputAttr} />
    <Switch.Label class="base-font-weight base-font-size" {...labelAttr}
      >{label ?? feild.name}</Switch.Label
    >
  </Switch>

  {#each remoteFormFeild.issues() ?? [] as issue}
    <span class="block text-warning-950-50 border-b-warning-400-600"
      >{issue.message}</span
    >
  {/each}
</div>
