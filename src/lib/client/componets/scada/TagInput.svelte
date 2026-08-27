<script lang="ts">
  import { setTagValue, getTagValue } from "$live/tags";
  import type { HTMLInputAttributes } from "svelte/elements";
  import { Portal, Tooltip } from "@skeletonlabs/skeleton-svelte";
  import { err, ok, type Result } from "neverthrow";
  import type { RpcError } from "svelte-realtime/client";

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

  const stream = getTagValue(lookup).rune();

  const t = $derived.by(() => {
    if (stream.current && "error" in stream.current)
      return err(stream.current.error);
    return ok(stream.current);
  });

  let isFocus = $state(false);

  function write(value: unknown) {
    const key = lookup;
    if (!key) return;
    setTagValue({ id: key, value });
  }

  function classWithError(base: string): string {
    let err = false;
    if (t.isErr()) err = true;
    else if (t.value?.statusString !== "Good") err = true;

    return err
      ? `${base} outline -outline-offset-1 outline-error-400-600 ${clazz ?? ""}`
      : `${base} ${clazz ?? ""}`;
  }
</script>

<svelte:boundary>
  <Tooltip positioning={{ placement: "top" }}>
    {#if t.isErr()}
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content class="card p-2 preset-filled-error-400-600">
            <p>{t.error.message}</p>
          </Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    {:else}
      <label for="input" class="label">{label ?? t.value?.name ?? lookup}</label
      >
      <Tooltip.Trigger tabindex={-1}>
        {#if t.value}
          {#if typeof t.value.value === "boolean"}
            <input
              type="checkbox"
              name="input"
              class={classWithError("checkbox")}
              checked={t.value.value}
              oninput={(ev) => write(Boolean(ev.currentTarget.checked))}
              disabled={!t.value.options.writeable}
              {...rest}
            />
          {:else if typeof t.value.value === "number"}
            <input
              type="number"
              name="input"
              class={classWithError("input")}
              value={isFocus ? undefined : t.value.value}
              onkeyup={(ev) => {
                if (ev.currentTarget) {
                  if (ev.key === "Enter") {
                    write(Number(ev.currentTarget.value));
                    ev.currentTarget.blur();
                  }
                  if (ev.key === "Escape") {
                    ev.currentTarget.value = String(t.value?.value);
                    ev.currentTarget.blur();
                  }
                }
              }}
              onfocusout={(ev) => {
                if (ev.currentTarget.value) {
                  write(Number(ev.currentTarget.value));
                } else {
                  ev.currentTarget.value = String(t.value?.value);
                }
                isFocus = false;
              }}
              onfocusin={() => {
                isFocus = true;
              }}
              disabled={!t.value.options.writeable}
              {...rest}
            />
          {:else}
            <input
              type="text"
              name="input"
              class={classWithError("input")}
              value={isFocus ? undefined : t.value.value}
              onkeyup={(ev) => {
                if (ev.currentTarget) {
                  if (ev.key === "Enter") {
                    write(String(ev.currentTarget.value));
                    ev.currentTarget.blur();
                  }
                  if (ev.key === "Escape") {
                    ev.currentTarget.value = String(t.value?.value);
                    ev.currentTarget.blur();
                  }
                }
              }}
              onfocusout={(ev) => {
                if (ev.currentTarget.value) {
                  write(String(ev.currentTarget.value));
                } else {
                  ev.currentTarget.value = String(t.value?.value);
                }
                isFocus = false;
              }}
              onfocusin={() => {
                isFocus = true;
              }}
              disabled={!t.value.options.writeable}
              {...rest}
            />
          {/if}
        {/if}
      </Tooltip.Trigger>
    {/if}
  </Tooltip>

  {#snippet failed(error: unknown)}
    <p class="text-error-400-600">{(error as any)?.message ?? String(error)}</p>
  {/snippet}
</svelte:boundary>
