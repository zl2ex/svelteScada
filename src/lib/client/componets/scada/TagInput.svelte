<script lang="ts">
  import { setTagValue, getTagValue } from "$live/tags";
  import type { HTMLInputAttributes } from "svelte/elements";
  import { Portal, Tooltip } from "@skeletonlabs/skeleton-svelte";
  import { RpcError } from "svelte-realtime/client";
  import type { ClientTagValue, FailedTag } from "$lib/server/tag/tag";

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

  const streamStore = getTagValue(lookup);

  const streamRune = streamStore.rune();

  // Discriminate the states `streamRune.current` can be:
  // - `{ error: RpcError }`            - stream/transport level failure
  // - `{ ok: false, error: FailedTag }` - the `Result` Err side (failed tag)
  // - `{ ok: true, value: ClientTagValue }` - the `Result` Ok side (healthy tag)
  type TagInputState =
    | { kind: "rpcError"; error: RpcError }
    | { kind: "failed"; error: FailedTag }
    | { kind: "ok"; value: ClientTagValue }
    | { kind: "loading" };

  const streamState = $derived.by(() => {
    const cur = streamRune.current;
    if (!cur) return { kind: "loading" } as const;
    if ("error" in cur) {
      const err = cur.error;
      return err instanceof RpcError
        ? ({ kind: "rpcError", error: err } as const)
        : ({ kind: "failed", error: err } as const);
    }
    if ("value" in cur && cur.value)
      return { kind: "ok", value: cur.value } as const;
    return { kind: "loading" } as const;
  });

  let isFocus = $state(false);

  function write(value: unknown) {
    const id = streamState.value?.id ?? lookup;
    setTagValue({ id, value });
  }

  function classWithError(base: string): string {
    return streamState.kind == "ok" && streamState.value.statusString !== "Good"
      ? `${base} outline -outline-offset-1 outline-error-400-600 ${clazz ?? ""}`
      : `${base} ${clazz ?? ""}`;
  }
</script>

<svelte:boundary
  onerror={(err) => {
    console.error(err);
  }}
>
  {#if streamState.kind === "rpcError"}
    <!-- RpcError - stream/transport level failure -->
    <pre class="text-error-400-600">{streamState.error.message}</pre>
  {:else if streamState.kind === "failed"}
    <!-- Result<Error> - failed tag: reason + cause in a tooltip -->
    <Tooltip positioning={{ placement: "top" }}>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content class="card p-2 preset-filled-error-400-600 text-xs">
            <p class="heading-font-weight">{streamState.error.reason}</p>
            {#if "cause" in streamState.error}
              {#if streamState.error.cause instanceof String}
                <p>{streamState.error.cause}</p>
              {:else if "message" in streamState.error.cause}
                <p>{streamState.error.cause.message}</p>
              {:else}
                <pre>{JSON.stringify(streamState.error.cause, null, 2)}</pre>
              {/if}
            {/if}
          </Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
      <Tooltip.Trigger tabindex={-1}>
        <label for="input" class="label">{label ?? lookup}</label>
        <p class="text-error-400-600">{streamState.error.reason}</p>
      </Tooltip.Trigger>
    </Tooltip>
  {:else if streamState.kind === "ok"}
    <!-- Result<Ok> - healthy tag: render the input -->
    <Tooltip positioning={{ placement: "top" }}>
      {#if streamState.value.statusString !== "Good"}
        <Portal>
          <Tooltip.Positioner>
            <Tooltip.Content
              class="card p-2 preset-filled-error-400-600 text-xs"
            >
              <p>{streamState.value.statusString}</p>
            </Tooltip.Content>
          </Tooltip.Positioner>
        </Portal>
      {/if}
      <Tooltip.Trigger tabindex={-1}>
        <label for="input" class="label"
          >{label ?? streamState.value.name ?? lookup}</label
        >
        {#if typeof streamState.value.value === "boolean"}
          <input
            type="checkbox"
            name="input"
            class={classWithError("checkbox")}
            checked={streamState.value.value}
            oninput={(ev) => write(Boolean(ev.currentTarget.checked))}
            disabled={!streamState.value.options.writeable}
            {...rest}
          />
        {:else if typeof streamState.value.value === "number"}
          <input
            type="number"
            name="input"
            class={classWithError("input")}
            value={isFocus ? undefined : streamState.value.value}
            onkeyup={(ev) => {
              if (ev.currentTarget) {
                if (ev.key === "Enter") {
                  write(Number(ev.currentTarget.value));
                  ev.currentTarget.blur();
                }
                if (ev.key === "Escape") {
                  ev.currentTarget.value = String(streamState.value.value);
                  ev.currentTarget.blur();
                }
              }
            }}
            onfocusout={(ev) => {
              if (ev.currentTarget.value) {
                write(Number(ev.currentTarget.value));
              } else {
                ev.currentTarget.value = String(streamState.value.value);
              }
              isFocus = false;
            }}
            onfocusin={() => {
              isFocus = true;
            }}
            disabled={!streamState.value.options.writeable}
            {...rest}
          />
        {:else}
          <input
            type="text"
            name="input"
            class={classWithError("input")}
            value={isFocus ? undefined : streamState.value.value}
            onkeyup={(ev) => {
              if (ev.currentTarget) {
                if (ev.key === "Enter") {
                  write(String(ev.currentTarget.value));
                  ev.currentTarget.blur();
                }
                if (ev.key === "Escape") {
                  ev.currentTarget.value = String(streamState.value.value);
                  ev.currentTarget.blur();
                }
              }
            }}
            onfocusout={(ev) => {
              if (ev.currentTarget.value) {
                write(String(ev.currentTarget.value));
              } else {
                ev.currentTarget.value = String(streamState.value.value);
              }
              isFocus = false;
            }}
            onfocusin={() => {
              isFocus = true;
            }}
            disabled={!streamState.value.options.writeable}
            {...rest}
          />
        {/if}
      </Tooltip.Trigger>
    </Tooltip>
  {/if}
  {#snippet failed(error)}
    <p class="text-error-400-600">{error}</p>
  {/snippet}
</svelte:boundary>
