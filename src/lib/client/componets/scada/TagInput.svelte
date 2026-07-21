<script lang="ts">
  import { tagValues, setTagValue } from "$live/tags";
  import type { HTMLInputAttributes } from "svelte/elements";
  import { Portal, Tooltip } from "@skeletonlabs/skeleton-svelte";

  interface TagValueState {
    id: string;
    name: string;
    value: unknown;
    statusCode: string;
    errorMessage: string | null;
    writeable: boolean;
  }

  interface Props extends HTMLInputAttributes {
    id?: string;
    path?: string;
    label?: string;
    class?: string;
  }

  let { id, path, label, class: clazz, ...rest }: Props = $props();

  let lookup = $derived.by(() => id ?? path);

  const stream = lookup ? tagValues(lookup).rune() : null;

  let tag = $derived<TagValueState | null>(
    stream?.current && !("error" in stream.current)
      ? (stream.current as TagValueState)
      : null,
  );

  let isFocus = $state(false);

  function write(value: unknown) {
    const key = lookup;
    if (!key) return;
    setTagValue({ id: key, value });
  }

  function classWithError(base: string): string {
    const err = tag?.errorMessage || (tag && tag.statusCode !== "Good");
    return err
      ? `${base} outline -outline-offset-1 outline-error-400-600 ${clazz ?? ""}`
      : `${base} ${clazz ?? ""}`;
  }
</script>

<svelte:boundary>
  <label for="input" class="label">{label ?? tag?.name ?? lookup}</label>
  <Tooltip positioning={{ placement: "top" }}>
    <Tooltip.Trigger tabindex={-1}>
      {#if tag && tag.value !== undefined}
        {#if typeof tag.value === "boolean"}
          <input
            type="checkbox"
            name="input"
            class={classWithError("checkbox")}
            checked={tag.value}
            oninput={(ev) => write(Boolean(ev.currentTarget.checked))}
            disabled={!tag.writeable}
            {...rest}
          />
        {:else if typeof tag.value === "number"}
          <input
            type="number"
            name="input"
            class={classWithError("input")}
            value={isFocus ? undefined : tag.value}
            onkeyup={(ev) => {
              if (ev.currentTarget) {
                if (ev.key === "Enter") {
                  write(Number(ev.currentTarget.value));
                  ev.currentTarget.blur();
                }
                if (ev.key === "Escape") {
                  ev.currentTarget.value = String(tag.value);
                  ev.currentTarget.blur();
                }
              }
            }}
            onfocusout={(ev) => {
              if (ev.currentTarget.value) {
                write(Number(ev.currentTarget?.value));
              } else {
                ev.currentTarget.value = String(tag.value);
              }
              isFocus = false;
            }}
            onfocusin={() => {
              isFocus = true;
            }}
            disabled={!tag.writeable}
            {...rest}
          />
        {:else}
          <input
            type="text"
            name="input"
            class={classWithError("input")}
            value={isFocus ? undefined : tag.value}
            onkeyup={(ev) => {
              if (ev.currentTarget) {
                if (ev.key === "Enter") {
                  write(String(ev.currentTarget.value));
                  ev.currentTarget.blur();
                }
                if (ev.key === "Escape") {
                  ev.currentTarget.value = String(tag.value);
                  ev.currentTarget.blur();
                }
              }
            }}
            onfocusout={(ev) => {
              if (ev.currentTarget.value) {
                write(String(ev.currentTarget.value));
              } else {
                ev.currentTarget.value = String(tag.value);
              }
              isFocus = false;
            }}
            onfocusin={() => {
              isFocus = true;
            }}
            disabled={!tag.writeable}
            {...rest}
          />
        {/if}
      {:else}
        <span class="text-surface-500-800">loading...</span>
      {/if}
    </Tooltip.Trigger>
    {#if tag?.statusCode !== "Good" || tag?.errorMessage}
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content class="card p-2 preset-filled-error-400-600">
            {#if tag?.statusCode !== "Good"}
              <p class="heading-font-weight">{tag?.statusCode}</p>
            {/if}
            <p>{tag?.errorMessage}</p>
          </Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    {/if}
  </Tooltip>

  {#snippet failed(error: unknown)}
    <p class="text-error-400-600">{(error as any)?.message ?? String(error)}</p>
  {/snippet}
</svelte:boundary>
