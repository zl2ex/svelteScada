<script lang="ts">
  import { setTagValue, getTagValue } from "$live/tags";
  import type { HTMLInputAttributes } from "svelte/elements";
  import { Portal, Tooltip } from "@skeletonlabs/skeleton-svelte";

  interface IdProps extends HTMLInputAttributes {
    id: string;
    path?: string;
    label?: string;
    class?: string;
  }
  interface PathProps extends HTMLInputAttributes {
    id?: string;
    path: string;
    label?: string;
    class?: string;
  }

  type Props = IdProps | PathProps;

  let { id, path, label, class: clazz, ...rest }: Props = $props();

  let lookup = $derived.by(() => id ?? path ?? "");

  const tag = getTagValue(lookup).rune();

  let isFocus = $state(false);

  function write(value: unknown) {
    const key = lookup;
    if (!key) return;
    setTagValue({ id: key, value });
  }

  function classWithError(base: string): string {
    let err = false;
    if (!tag.current) err = true;
    else if ("error" in tag.current) err = true;
    else if (tag.current.statusString !== "Good") err = true;

    return err
      ? `${base} outline -outline-offset-1 outline-error-400-600 ${clazz ?? ""}`
      : `${base} ${clazz ?? ""}`;
  }
</script>

<svelte:boundary>
  <label for="input" class="label">{label ?? tag.current?.name ?? lookup}</label
  >
  <Tooltip positioning={{ placement: "top" }}>
    <Tooltip.Trigger tabindex={-1}>
      {#if tag.current && tag.current.value !== undefined}
        {#if typeof tag.current.value === "boolean"}
          <input
            type="checkbox"
            name="input"
            class={classWithError("checkbox")}
            checked={tag.current.value}
            oninput={(ev) => write(Boolean(ev.currentTarget.checked))}
            disabled={!tag.current.options.writeable}
            {...rest}
          />
        {:else if typeof tag.current.value === "number"}
          <input
            type="number"
            name="input"
            class={classWithError("input")}
            value={isFocus ? undefined : tag.current.value}
            onkeyup={(ev) => {
              if (ev.currentTarget) {
                if (ev.key === "Enter") {
                  write(Number(ev.currentTarget.value));
                  ev.currentTarget.blur();
                }
                if (ev.key === "Escape") {
                  ev.currentTarget.value = String(tag.current.value);
                  ev.currentTarget.blur();
                }
              }
            }}
            onfocusout={(ev) => {
              if (ev.currentTarget.value) {
                write(Number(ev.currentTarget?.value));
              } else {
                ev.currentTarget.value = String(tag.current.value);
              }
              isFocus = false;
            }}
            onfocusin={() => {
              isFocus = true;
            }}
            disabled={!tag.current.options.writeable}
            {...rest}
          />
        {:else}
          <input
            type="text"
            name="input"
            class={classWithError("input")}
            value={isFocus ? undefined : tag.current.value}
            onkeyup={(ev) => {
              if (ev.currentTarget) {
                if (ev.key === "Enter") {
                  write(String(ev.currentTarget.value));
                  ev.currentTarget.blur();
                }
                if (ev.key === "Escape") {
                  ev.currentTarget.value = String(tag.current.value);
                  ev.currentTarget.blur();
                }
              }
            }}
            onfocusout={(ev) => {
              if (ev.currentTarget.value) {
                write(String(ev.currentTarget.value));
              } else {
                ev.currentTarget.value = String(tag.current.value);
              }
              isFocus = false;
            }}
            onfocusin={() => {
              isFocus = true;
            }}
            disabled={!tag.current.options.writeable}
            {...rest}
          />
        {/if}
      {:else}
        <span class="text-surface-500-800">loading...</span>
      {/if}
    </Tooltip.Trigger>
    {#if tag.current?.statusString !== "Good" || tag.current?.error}
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content class="card p-2 preset-filled-error-400-600">
            {#if tag.current?.statusString !== "Good"}
              <p class="heading-font-weight">{tag.current?.statusString}</p>
            {/if}
            <p>{tag.current?.error?.message}</p>
          </Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    {/if}
  </Tooltip>

  {#snippet failed(error: unknown)}
    <p class="text-error-400-600">{(error as any)?.message ?? String(error)}</p>
  {/snippet}
</svelte:boundary>
