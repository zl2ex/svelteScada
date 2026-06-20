<!--text.svelte-->
<script lang="ts" module>
  import type { HTMLInputAttributes } from "svelte/elements";
  import type { RemoteFormField } from "@sveltejs/kit";
  import { getFeildContext } from "../modules/context.svelte";

  export interface RemoteFormInputProps extends HTMLInputAttributes {
    as:
      | "color"
      | "date"
      | "datetime-local"
      | "email"
      | "month"
      | "password"
      | "reset"
      | "search"
      | "tel"
      | "text"
      | "time"
      | "url"
      | "week";
  }

  // all options
  /*let test : "button"
      | "color"
      | "date"
      | "datetime-local"
      | "email"
      | "hidden"
      | "image"
      | "month"
      | "password"
      | "radio"
      | "reset"
      | "search"
      | "select"
      | "submit"
      | "tel"
      | "text"
      | "time"
      | "url"
      | "week";*/
</script>

<script lang="ts">
  let { as, children, ...rest }: RemoteFormInputProps = $props();
  let feild = getFeildContext() as RemoteFormField<string>;
  let feildAs = feild.as(as);
  if (typeof feildAs.value !== "string")
    throw Error(
      `[RemoteFormText] ${feildAs.name} - type of remote form ${typeof feildAs.value} is not assignable to string`,
    );
</script>

<input
  class={feild.issues()
    ? "input outline -outline-offset-1 outline-error-400-600"
    : "input"}
  autocomplete="true"
  id={feildAs.name}
  {...feildAs}
  {...rest}
/>
{@render children?.()}
