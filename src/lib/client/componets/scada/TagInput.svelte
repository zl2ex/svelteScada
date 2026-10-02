<script lang="ts">
  import { writeTagValue, getTagValue } from "$live/tags";
  import type { HTMLInputAttributes } from "svelte/elements";
  import { Portal, Tooltip } from "@skeletonlabs/skeleton-svelte";
  import { RpcError } from "svelte-realtime/client";
  import { type BaseTypeMap, type TagValue } from "$lib/server/tag/tag";
  import { UseStreamResult } from "$lib/client/live/streamResult.svelte";
  import { toast } from "$lib/client/toast.svelte";
  import {
    errorToString,
    neverThrowErrorToString,
    type NeverThrowError,
  } from "$lib/util/neverThrow";
  import { attempt } from "$lib/util/attempt";
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

  const stream = new UseStreamResult(() => getTagValue(lookup));

  let isFocus = $state(false);

  async function write(value: TagValue) {
    if (stream.status !== "connected") {
      return err({
        reason: "STATUS_NOT_CONNECTED",
        cause: `status ${stream.status} not connected`,
      } as const satisfies NeverThrowError);
    }
    if (stream.value.isErr) {
      return err(stream.value.error);
    }
    const id = stream.value.value.id ?? lookup;
    const result = await attempt(() => writeTagValue({ id, value }));
    if ("error" in result) {
      console.error(result.error);
      if (result.error instanceof RpcError) {
        toast({
          kind: "error",
          title: "Tag Write Error",
          description: result.error.message,
          duration: 3000,
        });
        return err({
          reason: "RPC_ERROR",
          cause: result.error.message,
        } as const satisfies NeverThrowError);
      }
      return err({
        reason: "UNKOWN_ERROR",
        cause: errorToString(result.error),
      } as const satisfies NeverThrowError);
    }
    if (result.data.isErr) {
      console.error(result.data.error);
      toast({
        kind: "error",
        title: "Tag Write Error",
        description: neverThrowErrorToString(result.data.error),
        duration: 3000,
      });
      return err(result.data.error);
    }
    return ok(result.data);
  }

  function classWithError(base: string): string {
    return stream.value.value && stream.value.value.statusString !== "Good"
      ? `${base} outline -outline-offset-1 outline-error-400-600 ${clazz ?? ""}`
      : `${base} ${clazz ?? ""}`;
  }

  const BaseTypeStep: Record<keyof BaseTypeMap, string> = {
    Boolean: "1",
    Double: "any",
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
  {#if stream.status === "loading"}
    <!--loading-->
  {:else if stream.status === "reconnecting"}
    <p>reconnecting</p>
  {:else if stream.status === "error"}
    <!-- transient transport failure (timeout / disconnect / auth) -->
    <Tooltip positioning={{ placement: "top" }}>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content class="card p-2 preset-filled-error-400-600 text-xs">
            <p>{stream.error.message}</p>
          </Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
      <Tooltip.Trigger tabindex={-1} class="shrink min-w-0">
        <p class="truncate">{label ?? lookup}</p>
        <p class="text-error-400-600 truncate">
          {stream.error.code}
        </p>
      </Tooltip.Trigger>
    </Tooltip>
  {:else if stream.status === "connected"}
    {#if stream.value.isErr}
      <Tooltip positioning={{ placement: "top" }}>
        <Portal>
          <Tooltip.Positioner>
            <Tooltip.Content
              class="card p-2 preset-filled-error-400-600 text-xs"
            >
              <NeverThrowErrorDisplay error={stream.value.error} />
            </Tooltip.Content>
          </Tooltip.Positioner>
        </Portal>
        <Tooltip.Trigger tabindex={-1} class="shrink min-w-0">
          <p class="truncate">
            {label ??
              ("options" in stream.value.error
                ? stream.value.error.options.name
                : undefined) ??
              lookup}
          </p>
          <p class="text-error-400-600 truncate">
            {stream.value.error.reason}
          </p>
        </Tooltip.Trigger>
      </Tooltip>
    {:else}
      <!-- Result<Ok> - healthy tag: render the input -->
      <Tooltip positioning={{ placement: "top" }}>
        {#if stream.value.value.statusString !== "Good"}
          <Portal>
            <Tooltip.Positioner>
              <Tooltip.Content
                class="card p-2 preset-filled-error-400-600 text-xs"
              >
                <p>{stream.value.value.statusString}</p>
              </Tooltip.Content>
            </Tooltip.Positioner>
          </Portal>
        {/if}
        <Tooltip.Trigger tabindex={-1}>
          <label for="input" class="label"
            >{label ?? stream.value.value.name ?? lookup}</label
          >
          {#if typeof stream.value.value.value === "boolean"}
            <input
              type="checkbox"
              name="input"
              class={classWithError("checkbox")}
              checked={stream.value.value.value}
              oninput={async (ev) => {
                if (!ev.target) return;
                //@ts-ignore
                const result = await write(Boolean(ev.target.checked));
                // revert if write failed
                if (result.isErr()) {
                  //@ts-ignore
                  ev.target.checked = Boolean(stream.value.value.value);
                }
              }}
              disabled={!stream.value.value.options.writeable}
              {...rest}
            />
          {:else if typeof stream.value.value.value === "number"}
            <input
              type="number"
              name="input"
              class={classWithError("input")}
              step={BaseTypeStep[stream.value.value.options.dataType]}
              value={isFocus ? undefined : stream.value.value.value}
              onkeyup={(ev) => {
                if (ev.currentTarget) {
                  if (ev.key === "Enter") {
                    write(Number(ev.currentTarget.value));
                    ev.currentTarget.blur();
                  }
                  if (ev.key === "Escape") {
                    ev.currentTarget.value = String(stream.value.value.value);
                    ev.currentTarget.blur();
                  }
                }
              }}
              onfocusout={(ev) => {
                if (ev.currentTarget.value) {
                  write(Number(ev.currentTarget.value));
                } else {
                  ev.currentTarget.value = String(stream.value.value.value);
                }
                isFocus = false;
              }}
              onfocusin={() => {
                isFocus = true;
              }}
              disabled={!stream.value.value.options.writeable}
              {...rest}
            />
          {:else}
            <input
              type="text"
              name="input"
              class={classWithError("input")}
              value={isFocus ? undefined : stream.value.value.value}
              onkeyup={(ev) => {
                if (ev.currentTarget) {
                  if (ev.key === "Enter") {
                    write(String(ev.currentTarget.value));
                    ev.currentTarget.blur();
                  }
                  if (ev.key === "Escape") {
                    ev.currentTarget.value = String(stream.value.value.value);
                    ev.currentTarget.blur();
                  }
                }
              }}
              onfocusout={(ev) => {
                if (ev.currentTarget.value) {
                  write(String(ev.currentTarget.value));
                } else {
                  ev.currentTarget.value = String(stream.value.value.value);
                }
                isFocus = false;
              }}
              onfocusin={() => {
                isFocus = true;
              }}
              disabled={!stream.value.value.options.writeable}
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
