<script lang="ts">
  import type { RemoteFormField } from "@sveltejs/kit";
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";

  type props = {
    children?: Snippet<[]>;
    remoteFormFeild: RemoteFormField<string>;
    defaultValue?: string;
    label?: string;
    divAttr?: HTMLAttributes<HTMLDivElement>;
    labelAttr?: HTMLAttributes<HTMLLabelElement>;
    inputAttr?: HTMLAttributes<HTMLInputElement>;
  };

  let {
    children,
    remoteFormFeild,
    defaultValue,
    label,
    divAttr,
    labelAttr,
    inputAttr,
  }: props = $props();

  let feild = $derived(remoteFormFeild.as("text"));

  $effect(() => {
    remoteFormFeild.set(defaultValue);
  });
</script>

<div {...divAttr}>
  <label class="label" for={feild.name} {...labelAttr}
    >{label ?? feild.name}</label
  >
  {@render children?.()}
  <input {...feild} class="input" {...inputAttr} />
  {#each remoteFormFeild.issues() ?? [] as issue}
    <span class="text-warning-950-50 border-b-warning-400-600"
      >{issue.message}</span
    >
  {/each}
</div>
