<script lang="ts">
  import type { RemoteFormField, RemoteFormIssue } from "@sveltejs/kit";
  import type { HTMLInputAttributes } from "svelte/elements";
  let { children } = $props();

  const classMap = {
    text: "input",
    number: "input",
    input: "input",
    checkbox: "checkbox",
    file: "file",
    radio: "radio",
    select: "select",
  };
</script>

{#snippet input(
  remoteFormFeild: RemoteFormField,
  type: string,
  defaultValue?: any,
  label?: string,
)}
  <div class="form-item">
    <label class="label" for={remoteFormFeild.as(type).name}
      >{label ?? remoteFormFeild.as(type).name}</label
    >
    <input
      {...remoteFormFeild.as(type)}
      value={defaultValue}
      checked={defaultValue}
      class={type == "checkbox" ? "checkbox" : "input"}
    />
    {#each remoteFormFeild.issues() ?? [] as issue}
      <span class="text-warning-950-50 border-b-warning-400-600"
        >{issue.message}</span
      >
    {/each}
  </div>
{/snippet}

{#snippet remoteFormFeild(
  attributes: HTMLInputAttributes,
  defaultValue?: string | number | boolean,
  issues?: RemoteFormIssue[],
  label?: string,
)}
  <div class="form-item">
    <label class="label" for={attributes.name}>{label ?? attributes.name}</label
    >
    <input
      {...attributes}
      value={defaultValue}
      checked={typeof defaultValue == "boolean" ? defaultValue : null}
      class={classMap[attributes.type]}
    />
    {#each issues ?? [] as issue}
      <span class="text-warning-950-50 border-b-warning-400-600"
        >{issue.message}</span
      >
    {/each}
  </div>
{/snippet}
