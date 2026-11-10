<script lang="ts">
  import { Portal, Popover } from "@skeletonlabs/skeleton-svelte";
  import { Settings2Icon } from "@lucide/svelte";
  import type { TagOptionsInput } from "$lib/server/tag/tag";
  import type { TagBindingKey } from "$lib/tagBindings";
  import { tagWriteLevels, type TagWriteLevel } from "$lib/permissions/constants";
  import { attempt } from "$lib/util/attempt";
  import BindingEditor from "./BindingEditor.svelte";

  type Props = {
    tags: TagOptionsInput[];
    dataTypes: string[];
    canUpdate: boolean;
    canManage: boolean;
    bindingValue: (key: TagBindingKey) => string;
    bindingMixed: (key: TagBindingKey) => boolean;
    bindingError: (key: TagBindingKey) => string | null;
    hasOverride: (key: string) => boolean;
    onSave: (changes: Partial<Omit<TagOptionsInput, "id">>) => void;
    onBindingSave: (key: TagBindingKey, expression: string) => void;
    onBindingRemove: (key: TagBindingKey) => void;
    onClearOverride: (key: string) => void;
  };

  let {
    tags,
    dataTypes,
    canUpdate,
    canManage,
    bindingValue,
    bindingMixed,
    bindingError,
    hasOverride,
    onSave,
    onBindingSave,
    onBindingRemove,
    onClearOverride,
  }: Props = $props();

  function valueOf<T>(read: (tag: TagOptionsInput) => T) {
    if (tags.length === 0) return { mixed: false, value: undefined as T | undefined };
    const first = read(tags[0]);
    const mixed = tags.some((tag) => !Object.is(read(tag), first));
    return mixed ? { mixed: true, value: undefined as T | undefined } : { mixed: false, value: first };
  }

  function jsonValueOf(read: (tag: TagOptionsInput) => unknown) {
    if (tags.length === 0) return { mixed: false, value: undefined as string | undefined };
    const values = tags.map((tag) => JSON.stringify(read(tag) ?? null));
    const mixed = values.some((value) => value !== values[0]);
    return mixed ? { mixed: true, value: undefined } : { mixed: false, value: values[0] };
  }

  let dataType = $derived(valueOf((tag) => tag.dataType));
  let nodeId = $derived(valueOf((tag) => tag.nodeId ?? ""));
  let writeable = $derived(valueOf((tag) => tag.writeable ?? true));
  let writeLevel = $derived(valueOf((tag) => tag.writeLevel ?? "operator"));
  let exposeOverOpcua = $derived(valueOf((tag) => tag.exposeOverOpcua ?? true));
  let trendEnabled = $derived(valueOf((tag) => tag.trendEnabled ?? false));
  let trendInterval = $derived(valueOf((tag) => tag.trendMinimumSamplingIntervalMs ?? 1000));
  let parameters = $derived(jsonValueOf((tag) => tag.parameters));
  let unit = $derived(valueOf((tag) => tag.unit ?? ""));

  function indeterminate(node: HTMLInputElement, value: boolean) {
    node.indeterminate = value;
    return {
      update(next: boolean) {
        node.indeterminate = next;
      },
    };
  }

  function saveParameters(event: Event & { currentTarget: HTMLTextAreaElement }) {
    const raw = event.currentTarget.value;
    if (!raw.trim()) {
      if (!parameters.mixed) onSave({ parameters: null });
      return;
    }
    const parsed = attempt(() => JSON.parse(raw));
    if (parsed.isErr) {
      event.currentTarget.value = parameters.value ?? "";
      return;
    }
    onSave({ parameters: parsed.data });
  }
</script>

<Portal>
  <Popover.Positioner>
    <Popover.Content class="bg-surface-100-900 card shadow dark:border-1 border-surface-200-800 p-2">
      <fieldset class="flex flex-col gap-2" disabled={!canUpdate}>
        <div class="flex items-center gap-2">
          <label class="opacity-60" for="multi-dataType">Data Type</label>
          {#if hasOverride("dataType")}
            <button
              type="button"
              class="size-2 shrink-0 rounded-full bg-primary-500"
              title="Instance override - click to remove"
              onclick={() => onClearOverride("dataType")}
            ></button>
          {/if}
        </div>
        <div class="flex items-center gap-2">
          <select
            id="multi-dataType"
            class="select py-1.5"
            value={dataType.mixed ? "" : dataType.value}
            onchange={(event) => {
              if (event.currentTarget.value) onSave({ dataType: event.currentTarget.value });
            }}
          >
            {#if dataType.mixed}
              <option value="" disabled>multiple</option>
            {/if}
            {#each dataTypes as type (type)}
              <option value={type}>{type}</option>
            {/each}
          </select>
          <BindingEditor
            label="Data Type"
            binding={bindingMixed("dataType") ? "" : bindingValue("dataType")}
            contextDescription="tagConfig"
            scope="tag"
            savedError={bindingMixed("dataType") ? null : bindingError("dataType")}
            onBindingSave={(expression) => onBindingSave("dataType", expression)}
            onBindingRemove={() => onBindingRemove("dataType")}
          />
        </div>

        <div class="flex items-center gap-2">
          <label class="opacity-60" for="multi-nodeId">Driver connection path</label>
          {#if hasOverride("nodeId")}
            <button
              type="button"
              class="size-2 shrink-0 rounded-full bg-primary-500"
              title="Instance override - click to remove"
              onclick={() => onClearOverride("nodeId")}
            ></button>
          {/if}
        </div>
        <div class="flex gap-2">
          <input
            id="multi-nodeId"
            type="text"
            class="input py-0 placeholder:opacity-50"
            value={nodeId.mixed ? "" : nodeId.value}
            placeholder={nodeId.mixed ? "multiple" : "[deviceName]pathToTag"}
            onblur={(event) => onSave({ nodeId: event.currentTarget.value || null })}
          />
          <BindingEditor
            label="Node Id"
            binding={bindingMixed("nodeId") ? "" : bindingValue("nodeId")}
            contextDescription="tagConfig"
            scope="tag"
            savedError={bindingMixed("nodeId") ? null : bindingError("nodeId")}
            onBindingSave={(expression) => onBindingSave("nodeId", expression)}
            onBindingRemove={() => onBindingRemove("nodeId")}
          />
        </div>

        <div class="flex items-center gap-2">
          <label class="opacity-60 mr-auto" for="multi-writeable">Writeable</label>
          {#if hasOverride("writeable")}
            <button
              type="button"
              class="size-2 shrink-0 rounded-full bg-primary-500"
              title="Instance override - click to remove"
              onclick={() => onClearOverride("writeable")}
            ></button>
          {/if}
          <input
            id="multi-writeable"
            type="checkbox"
            class="checkbox"
            use:indeterminate={writeable.mixed}
            checked={writeable.mixed ? false : writeable.value}
            onchange={(event) => onSave({ writeable: event.currentTarget.checked })}
          />
          <BindingEditor
            label="Writeable"
            binding={bindingMixed("writeable") ? "" : bindingValue("writeable")}
            contextDescription="tagConfig"
            scope="tag"
            savedError={bindingMixed("writeable") ? null : bindingError("writeable")}
            onBindingSave={(expression) => onBindingSave("writeable", expression)}
            onBindingRemove={() => onBindingRemove("writeable")}
          />
        </div>

        <div class="flex items-center gap-2">
          <label class="opacity-60" for="multi-writeLevel">Write Level</label>
          {#if hasOverride("writeLevel")}
            <button
              type="button"
              class="size-2 shrink-0 rounded-full bg-primary-500"
              title="Instance override - click to remove"
              onclick={() => onClearOverride("writeLevel")}
            ></button>
          {/if}
        </div>
        <select
          id="multi-writeLevel"
          class="select py-1.5"
          value={writeLevel.mixed ? "" : writeLevel.value}
          disabled={!canManage}
          onchange={(event) => {
            if (event.currentTarget.value) {
              onSave({ writeLevel: event.currentTarget.value as TagWriteLevel });
            }
          }}
        >
          {#if writeLevel.mixed}
            <option value="" disabled>multiple</option>
          {/if}
          {#each tagWriteLevels as level}
            <option value={level}>{level}</option>
          {/each}
        </select>

        <div class="flex items-center gap-2">
          <label class="opacity-60 mr-auto" for="multi-expose">Expose Tag On OPCUA Server</label>
          {#if hasOverride("exposeOverOpcua")}
            <button
              type="button"
              class="size-2 shrink-0 rounded-full bg-primary-500"
              title="Instance override - click to remove"
              onclick={() => onClearOverride("exposeOverOpcua")}
            ></button>
          {/if}
          <input
            id="multi-expose"
            type="checkbox"
            class="checkbox"
            use:indeterminate={exposeOverOpcua.mixed}
            checked={exposeOverOpcua.mixed ? false : exposeOverOpcua.value}
            onchange={(event) => onSave({ exposeOverOpcua: event.currentTarget.checked })}
          />
          <BindingEditor
            label="Expose OPC UA"
            binding={bindingMixed("exposeOverOpcua") ? "" : bindingValue("exposeOverOpcua")}
            contextDescription="tagConfig"
            scope="tag"
            savedError={bindingMixed("exposeOverOpcua") ? null : bindingError("exposeOverOpcua")}
            onBindingSave={(expression) => onBindingSave("exposeOverOpcua", expression)}
            onBindingRemove={() => onBindingRemove("exposeOverOpcua")}
          />
        </div>

        <hr />
        <p>Trending</p>

        <div class="flex items-center gap-2">
          <label class="opacity-60 mr-auto" for="multi-trendEnabled">Enabled</label>
          {#if hasOverride("trendEnabled")}
            <button
              type="button"
              class="size-2 shrink-0 rounded-full bg-primary-500"
              title="Instance override - click to remove"
              onclick={() => onClearOverride("trendEnabled")}
            ></button>
          {/if}
          <input
            id="multi-trendEnabled"
            type="checkbox"
            class="checkbox"
            use:indeterminate={trendEnabled.mixed}
            checked={trendEnabled.mixed ? false : trendEnabled.value}
            onchange={(event) => onSave({ trendEnabled: event.currentTarget.checked })}
          />
          <BindingEditor
            label="Trend Enabled"
            binding={bindingMixed("trendEnabled") ? "" : bindingValue("trendEnabled")}
            contextDescription="tagConfig"
            scope="tag"
            savedError={bindingMixed("trendEnabled") ? null : bindingError("trendEnabled")}
            onBindingSave={(expression) => onBindingSave("trendEnabled", expression)}
            onBindingRemove={() => onBindingRemove("trendEnabled")}
          />
        </div>

        <div class="flex items-center gap-2">
          <label class="opacity-60 mr-auto" for="multi-trendInterval">Minimum interval</label>
          {#if hasOverride("trendMinimumSamplingIntervalMs")}
            <button
              type="button"
              class="size-2 shrink-0 rounded-full bg-primary-500"
              title="Instance override - click to remove"
              onclick={() => onClearOverride("trendMinimumSamplingIntervalMs")}
            ></button>
          {/if}
          <input
            id="multi-trendInterval"
            type="number"
            class="input placeholder:opacity-50"
            min="100"
            step="100"
            value={trendInterval.mixed ? "" : trendInterval.value}
            placeholder={trendInterval.mixed ? "multiple" : "minimum interval ms"}
            onblur={(event) => {
              if (event.currentTarget.value) {
                onSave({ trendMinimumSamplingIntervalMs: Number(event.currentTarget.value) });
              }
            }}
          />
          <span class="text-xs opacity-60">ms</span>
          <BindingEditor
            label="Trend Interval"
            binding={bindingMixed("trendMinimumSamplingIntervalMs") ? "" : bindingValue("trendMinimumSamplingIntervalMs")}
            contextDescription="tagConfig"
            scope="tag"
            savedError={bindingMixed("trendMinimumSamplingIntervalMs") ? null : bindingError("trendMinimumSamplingIntervalMs")}
            onBindingSave={(expression) => onBindingSave("trendMinimumSamplingIntervalMs", expression)}
            onBindingRemove={() => onBindingRemove("trendMinimumSamplingIntervalMs")}
          />
        </div>

        <div class="flex items-start gap-2">
          <Settings2Icon class="size-4 shrink-0 opacity-60 mt-1" />
          <div class="flex flex-col gap-1 flex-1">
            <div class="flex items-center gap-2">
              <label class="opacity-60" for="multi-parameters">Parameters</label>
              {#if hasOverride("parameters")}
                <button
                  type="button"
                  class="size-2 shrink-0 rounded-full bg-primary-500"
                  title="Instance override - click to remove"
                  onclick={() => onClearOverride("parameters")}
                ></button>
              {/if}
            </div>
            <textarea
              id="multi-parameters"
              rows="4"
              class="input placeholder:opacity-50 py-0 font-mono text-xs"
              value={parameters.mixed ? "" : parameters.value}
              placeholder={parameters.mixed ? "multiple" : ""}
              onblur={saveParameters}
            ></textarea>
          </div>
          <BindingEditor
            label="Parameters"
            binding={bindingMixed("parameters") ? "" : bindingValue("parameters")}
            contextDescription="tagConfig"
            scope="tag"
            savedError={bindingMixed("parameters") ? null : bindingError("parameters")}
            onBindingSave={(expression) => onBindingSave("parameters", expression)}
            onBindingRemove={() => onBindingRemove("parameters")}
          />
        </div>

        <div class="flex items-center gap-2">
          <Settings2Icon class="size-4 shrink-0 opacity-60" />
          <label class="opacity-60" for="multi-unit">Unit</label>
          {#if hasOverride("unit")}
            <button
              type="button"
              class="size-2 shrink-0 rounded-full bg-primary-500"
              title="Instance override - click to remove"
              onclick={() => onClearOverride("unit")}
            ></button>
          {/if}
          <input
            id="multi-unit"
            type="text"
            class="input py-0 placeholder:opacity-50"
            value={unit.mixed ? "" : unit.value}
            placeholder={unit.mixed ? "multiple" : ""}
            onblur={(event) => onSave({ unit: event.currentTarget.value })}
          />
          <BindingEditor
            label="Unit"
            binding={bindingMixed("unit") ? "" : bindingValue("unit")}
            contextDescription="tagConfig"
            scope="tag"
            savedError={bindingMixed("unit") ? null : bindingError("unit")}
            onBindingSave={(expression) => onBindingSave("unit", expression)}
            onBindingRemove={() => onBindingRemove("unit")}
          />
        </div>
      </fieldset>
    </Popover.Content>
  </Popover.Positioner>
</Portal>
