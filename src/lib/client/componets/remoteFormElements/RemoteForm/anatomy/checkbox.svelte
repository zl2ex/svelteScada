<script lang="ts" module>
  import type { HTMLInputAttributes } from "svelte/elements";
  import type { RemoteFormField } from "@sveltejs/kit";
  import { getFeildContext } from "../modules/context.svelte";

  export interface RemoteFormCheckboxProps extends HTMLInputAttributes {}
</script>

<script lang="ts">
  let { children, ...rest }: RemoteFormCheckboxProps = $props();
  let feild = getFeildContext() as RemoteFormField<boolean>;
  if (
    typeof feild.as("checkbox").value !== "boolean" &&
    typeof feild.as("checkbox").value !== "undefined"
  )
    throw Error(
      `[RemoteFormText] ${feild.as("checkbox").name} - type of remote form ${typeof feild.as("checkbox").value} is not assignable to boolean`,
    );
</script>

<input
  class={feild.issues()
    ? "checkbox outline -outline-offset-1 outline-error-400-600"
    : "chexkbox"}
  {...feild.as("checkbox")}
  {...rest}
/>
{@render children?.()}
