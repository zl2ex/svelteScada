<script lang="ts">
  import type { RemoteFormField } from "@sveltejs/kit";
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";

  type props = {
    children?: Snippet<[]>;
    remoteFormFeild: RemoteFormField<string | string[]>;
    defaultValue?: string | string[];
    label?: string;
    divAttr?: HTMLAttributes<HTMLDivElement>;
    labelAttr?: HTMLAttributes<HTMLLabelElement>;
    selectAttr?: HTMLAttributes<HTMLSelectElement>;
  };

  let {
    children,
    remoteFormFeild,
    defaultValue,
    label,
    divAttr,
    labelAttr,
    selectAttr,
  }: props = $props();

  let feild = $derived(remoteFormFeild.as("select"));

  $effect(() => {
    remoteFormFeild.set(defaultValue);
  });
</script>

<div {...divAttr}>
  <label class="label" for={feild.name} {...labelAttr}
    >{label ?? feild.name}</label
  >
  <select {...feild} class="select" {...selectAttr}>
    {@render children?.()}
  </select>
  {#each remoteFormFeild.issues() ?? [] as issue}
    <span class="text-warning-950-50 border-b-warning-400-600"
      >{issue.message}</span
    >
  {/each}
</div>
