<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";
  import { Portal, Tooltip } from "@skeletonlabs/skeleton-svelte";
  import { type BaseTypeMap, type TagValue } from "$lib/server/tag/tag";
  import { getTagValueMapContext } from "$lib/client/live/tagMapContext";
  import { toast } from "$lib/client/toast.svelte";
  import { neverThrowErrorToString, type NeverThrowError } from "$lib/util/neverThrow";
  import { err, ok } from "neverthrow";
  import NeverThrowErrorDisplay from "$lib/client/componets/NeverThrowErrorDisplay.svelte";

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

  const tagValueMap = getTagValueMapContext();
  let entry = $derived(tagValueMap.tag(lookup));

  let isFocus = $state(false);

  async function write(value: TagValue) {
    if (!entry || entry.status !== "connected") {
      return err({
        reason: "STATUS_NOT_CONNECTED",
        cause: `status ${entry?.status ?? "missing"} not connected`,
      } as const satisfies NeverThrowError);
    }
    if (entry.value.isErr) {
      return err(entry.value.error);
    }
    const result = await tagValueMap.writeTag(lookup, value);
    if (result.isErr) {
      console.error(result.error);
      return err(result.error);
    }
    return ok(result.value);
  }

  function classWithError(base: string): string {
    return entry?.value?.isOk && entry.value.value.statusString !== "Good"
      ? `${base} outline -outline-offset-1 outline-error-400-600 ${clazz ?? ""}`
      : `${base} ${clazz ?? ""}`;
  }

  const BaseTypeStep: Record<keyof BaseTypeMap, string> = {
    Boolean: "1",
    Double: "any",
    Float: "any",
    Int16: "1",
    UInt16: "1",
    Int32: "1",
    UInt32: "1",
    Int64: "1",
    UInt64: "1",
    String: "any",
  };
</script>

<svelte:boundary
  onerror={(err) => {
    console.error(err);
  }}
>
  {#if !entry || entry.status === "loading"}
    <p class="truncate">{label ?? lookup}</p>
  {:else if entry.status === "reconnecting"}
    <p>reconnecting</p>
  {:else if entry.status === "error"}
    <!-- transient transport failure (timeout / disconnect / auth) -->
    <Tooltip positioning={{ placement: "top" }}>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content class="card p-2 preset-filled-error-400-600 text-xs">
            <p>{entry.error.message}</p>
          </Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
      <Tooltip.Trigger tabindex={-1} class="shrink min-w-0">
        <p class="truncate">{label ?? lookup}</p>
        <p class="text-error-400-600 truncate">
          {entry.error.code}
        </p>
      </Tooltip.Trigger>
    </Tooltip>
  {:else if entry.status === "connected"}
    {#if entry.value.isErr}
      <Tooltip positioning={{ placement: "top" }}>
        <Portal>
          <Tooltip.Positioner>
            <Tooltip.Content class="card p-2 preset-filled-error-400-600 text-xs">
              <NeverThrowErrorDisplay error={entry.value.error} />
            </Tooltip.Content>
          </Tooltip.Positioner>
        </Portal>
        <Tooltip.Trigger tabindex={-1} class="shrink min-w-0">
          <p class="truncate">
            {label ??
              ("options" in entry.value.error ? entry.value.error.options.name : undefined) ??
              lookup}
          </p>
          <p class="text-error-400-600 truncate">
            {entry.value.error.reason}
          </p>
        </Tooltip.Trigger>
      </Tooltip>
    {:else}
      {@const tag = entry.value.value}
      <!-- Result<Ok> - healthy tag: render the input -->
      <Tooltip positioning={{ placement: "top" }}>
        {#if tag.statusString !== "Good"}
          <Portal>
            <Tooltip.Positioner>
              <Tooltip.Content class="card p-2 preset-filled-error-400-600 text-xs">
                <p>{tag.statusString}</p>
              </Tooltip.Content>
            </Tooltip.Positioner>
          </Portal>
        {/if}
        <Tooltip.Trigger tabindex={-1}>
          <label for="input" class="label">{label ?? tag.name ?? lookup}</label>
          {#if typeof tag.value === "boolean"}
            <input
              type="checkbox"
              name="input"
              class={classWithError("checkbox")}
              checked={tag.value}
              oninput={async (ev) => {
                if (!ev.target) return;
                //@ts-ignore
                const result = await write(Boolean(ev.target.checked));
                // revert if write failed
                if (result.isErr()) {
                  //@ts-ignore
                  ev.target.checked = Boolean(tag.value);
                }
              }}
              disabled={!tag.options.writeable}
              {...rest}
            />
          {:else if typeof tag.value === "number"}
            <input
              type="number"
              name="input"
              class={classWithError("input")}
              step={BaseTypeStep[tag.options.dataType]}
              value={isFocus ? undefined : tag.value}
              onkeyup={(ev) => {
                if (ev.currentTarget) {
                  if (ev.key === "Enter") {
                    ev.currentTarget.blur();
                  }
                  if (ev.key === "Escape") {
                    ev.currentTarget.value = String(tag.value);
                    ev.currentTarget.blur();
                  }
                }
              }}
              onblur={(ev) => {
                if (ev.currentTarget.value) {
                  write(Number(ev.currentTarget.value));
                } else {
                  ev.currentTarget.value = String(tag.value);
                }
                isFocus = false;
              }}
              onfocusin={() => {
                isFocus = true;
              }}
              disabled={!tag.options.writeable}
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
                    ev.currentTarget.blur();
                  }
                  if (ev.key === "Escape") {
                    ev.currentTarget.value = String(tag.value);
                    ev.currentTarget.blur();
                  }
                }
              }}
              onblur={(ev) => {
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
              disabled={!tag.options.writeable}
              {...rest}
            />
          {/if}
        </Tooltip.Trigger>
      </Tooltip>
    {/if}
  {/if}
  {#snippet failed(error)}
    <p class="text-error-400-600">{error}</p>
  {/snippet}
</svelte:boundary>
