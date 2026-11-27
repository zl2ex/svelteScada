<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";
  import { Portal, Tooltip } from "@skeletonlabs/skeleton-svelte";
  import { type TagValue } from "$lib/server/tag/tag";
  import { getTagValueMapContext } from "$lib/client/live/tagMapContext";
  import { type NeverThrowError } from "$lib/util/neverThrow";
  import { err, ok } from "neverthrow";
  import NeverThrowErrorDisplay from "$lib/client/componets/NeverThrowErrorDisplay.svelte";
  import { getAbilityContext } from "$lib/client/permissions/abilityContext";
  import { canWriteTag } from "$lib/permissions/ability";
  import type { TagWriteLevel } from "$lib/permissions/constants";
  import { commitOrRevert } from "$lib/client/util/use";

  interface Props extends HTMLInputAttributes {
    id?: string;
    path?: string;
    label?: string;
    class?: string;
  }

  let { id, path, label, class: clazz, ...rest }: Props = $props();

  let lookup = $derived.by(() => id ?? path ?? "");

  const tagValueMap = getTagValueMapContext();
  const ability = getAbilityContext();
  let entry = $derived(tagValueMap.tag(lookup));

  let isFocus = $state(false);

  /**
   * Writes a value to the looked-up tag after checking connection, value errors
   * and write permissions.
   *
   * @param value - value to write to the tag
   * @returns ok with the write result, or err when unavailable or forbidden
   */
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
    if (!canWrite(entry.value.value.options.writeLevel)) {
      return err({
        reason: "WRITE_FORBIDDEN",
        cause: `your role cannot write ${entry.value.value.options.writeLevel} tags`,
      } as const satisfies NeverThrowError);
    }
    const result = await tagValueMap.writeTag(lookup, value);
    if (result.isErr) {
      console.error(result.error);
      return err(result.error);
    }
    return ok(result.value);
  }

  /**
   * Checks whether the current user may write to a tag at the given level.
   *
   * @param writeLevel - tag write level, defaults to "operator" when undefined
   * @returns true when the current ability can write tags at that level
   */
  function canWrite(writeLevel: TagWriteLevel | undefined): boolean {
    return canWriteTag(ability, writeLevel ?? "operator");
  }

  /**
   * Commits a numeric input value, treating null as a no-op.
   *
   * @param value - numeric value from the input, or null when empty
   * @returns true when the write succeeded, otherwise false
   */
  async function commitNumber(value: number | null) {
    if (value === null) return false;
    const result = await write(value);
    return result.isOk();
  }

  /**
   * Commits a text input value, treating an empty string as a no-op.
   *
   * @param value - text value from the input
   * @returns true when the write succeeded, otherwise false
   */
  async function commitText(value: string) {
    if (value === "") return false;
    const result = await write(value);
    return result.isOk();
  }

  /**
   * Appends error outline classes when the tag has a non-Good status.
   *
   * @param base - base class string for the input control
   * @returns the composed class string including any custom class
   */
  function classWithError(base: string): string {
    return entry?.value?.isOk && entry.value.value.statusString !== "Good"
      ? `${base} outline -outline-offset-1 outline-error-400-600 ${clazz ?? ""}`
      : `${base} ${clazz ?? ""}`;
  }
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
              disabled={tag.options.readonly || !canWrite(tag.options.writeLevel)}
              {...rest}
            />
          {:else if typeof tag.value === "number" || typeof tag.value === "bigint"}
            <input
              type="number"
              name="input"
              class={classWithError("input")}
              value={isFocus ? undefined : tag.value}
              onblur={() => {
                isFocus = false;
              }}
              onfocusin={() => {
                isFocus = true;
              }}
              {@attach commitOrRevert(commitNumber, "number")}
              disabled={tag.options.readonly || !canWrite(tag.options.writeLevel)}
              {...rest}
            />
          {:else if typeof tag.value === "string"}
            <input
              type="text"
              name="input"
              class={classWithError("input")}
              value={isFocus ? undefined : tag.value}
              onblur={() => {
                isFocus = false;
              }}
              onfocusin={() => {
                isFocus = true;
              }}
              {@attach commitOrRevert(commitText)}
              disabled={tag.options.readonly || !canWrite(tag.options.writeLevel)}
              {...rest}
            />
          {:else}
            <input
              type="text"
              name="input"
              class={classWithError("input")}
              value="object"
              disabled
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
