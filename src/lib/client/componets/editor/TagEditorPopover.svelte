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
    bindingComputed: (key: TagBindingKey) => {
      bound: boolean;
      mixed: boolean;
      value: string | undefined;
    };
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
    bindingComputed,
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
    return mixed
      ? { mixed: true, value: undefined as T | undefined }
      : { mixed: false, value: first };
  }

  function jsonValueOf(read: (tag: TagOptionsInput) => unknown) {
    if (tags.length === 0) return { mixed: false, value: undefined as string | undefined };
    const values = tags.map((tag) => JSON.stringify(read(tag) ?? null));
    const mixed = values.some((value) => value !== values[0]);
    return mixed ? { mixed: true, value: undefined } : { mixed: false, value: values[0] };
  }

  let dataType = $derived(valueOf((tag) => tag.dataType));
  let driverPath = $derived(valueOf((tag) => tag.driverPath ?? ""));
  let readonly = $derived(valueOf((tag) => tag.readonly ?? false));
  let writeLevel = $derived(valueOf((tag) => tag.writeLevel ?? "operator"));
  let exposeOverOpcua = $derived(valueOf((tag) => tag.exposeOverOpcua ?? true));
  let trendEnabled = $derived(valueOf((tag) => tag.trendEnabled ?? false));
  let trendInterval = $derived(valueOf((tag) => tag.trendMinimumSamplingIntervalMs ?? 1000));
  let properties = $derived(jsonValueOf((tag) => tag.properties));
  let unit = $derived(valueOf((tag) => tag.unit ?? ""));

  function textView<T>(key: TagBindingKey, normal: { mixed: boolean; value: T | undefined }) {
    const computed = bindingComputed(key);
    if (computed.bound) {
      return {
        value: computed.mixed ? "" : (computed.value ?? ""),
        mixed: computed.mixed,
        disabled: true,
      };
    }

    return {
      value: normal.mixed ? "" : (normal.value ?? ""),
      mixed: normal.mixed,
      disabled: !canUpdate,
    };
  }

  function checkboxView(
    key: TagBindingKey,
    normal: { mixed: boolean; value: boolean | undefined },
  ) {
    const computed = bindingComputed(key);
    if (computed.bound) {
      return {
        checked: !computed.mixed && computed.value === "true",
        mixed: computed.mixed,
        disabled: true,
      };
    }

    return {
      checked: normal.mixed ? false : Boolean(normal.value),
      mixed: normal.mixed,
      disabled: !canUpdate,
    };
  }

  function indeterminate(node: HTMLInputElement, value: boolean) {
    node.indeterminate = value;
    return {
      update(next: boolean) {
        node.indeterminate = next;
      },
    };
  }

  let dataTypeView = $derived(textView("dataType", dataType));
  let driverPathView = $derived(textView("driverPath", driverPath));
  let readonlyView = $derived(checkboxView("readonly", readonly));
  let exposeView = $derived(checkboxView("exposeOverOpcua", exposeOverOpcua));
  let trendEnabledView = $derived(checkboxView("trendEnabled", trendEnabled));
  let trendIntervalView = $derived(textView("trendMinimumSamplingIntervalMs", trendInterval));
  let propertiesView = $derived(textView("properties", properties));
  let unitView = $derived(textView("unit", unit));

  function saveProperties(event: Event & { currentTarget: HTMLTextAreaElement }) {
    const raw = event.currentTarget.value;
    if (!raw.trim()) {
      if (!properties.mixed) onSave({ properties: null });
      return;
    }
    const parsed = attempt(() => JSON.parse(raw));
    if (parsed.isErr) {
      event.currentTarget.value = properties.value ?? "";
      return;
    }
    onSave({ properties: parsed.data });
  }
</script>

{#snippet overrideIndicator(property: keyof TagOptionsInput)}
  {#if hasOverride(property)}
    <button
      type="button"
      class="size-4 shrink-0 rounded-full bg-primary-500"
      title="Instance override - click to remove"
      onclick={() => onClearOverride(property)}
    ></button>
  {:else}
    <div
      class="size-4 shrink-0 rounded-full bg-surface-200-800 border-1 border-surface-400-600"
      title="Value inherited"
    ></div>
  {/if}
{/snippet}

<Portal>
  <Popover.Positioner>
    <Popover.Content
      class="bg-surface-100-900 card shadow dark:border-1 border-surface-200-800 p-2"
    >
      <fieldset class="flex flex-col gap-2" disabled={!canUpdate}>
        <div class="flex items-center gap-2">
          <label class="opacity-60" for="multi-dataType">Data Type</label>
          {@render overrideIndicator("dataType")}
        </div>
        <div class="flex items-center gap-2">
          {#if bindingComputed("dataType").bound}
            <input
              id="multi-dataType"
              class="input py-1.5"
              value={dataTypeView.value}
              placeholder={dataTypeView.mixed ? "multiple" : ""}
              disabled
            />
          {:else}
            <select
              id="multi-dataType"
              class="select py-1.5"
              value={dataTypeView.value}
              disabled={!canUpdate}
              onchange={(event) => {
                if (event.currentTarget.value) onSave({ dataType: event.currentTarget.value });
              }}
            >
              {#if dataTypeView.mixed}
                <option value="" disabled>multiple</option>
              {/if}
              {#each dataTypes as type (type)}
                <option value={type}>{type}</option>
              {/each}
            </select>
          {/if}
          <BindingEditor
            label="Data Type"
            binding={bindingMixed("dataType") ? "" : bindingValue("dataType")}
            contextDescription="tagConfig and properties"
            scope="tag"
            savedError={bindingMixed("dataType") ? null : bindingError("dataType")}
            onBindingSave={(expression) => onBindingSave("dataType", expression)}
            onBindingRemove={() => onBindingRemove("dataType")}
          />
        </div>

        <div class="flex items-center gap-2">
          <label class="opacity-60" for="multi-driverPath">Driver path</label>
          {@render overrideIndicator("driverPath")}
        </div>
        <div class="flex gap-2">
          <input
            id="multi-driverPath"
            type="text"
            class="input py-0 placeholder:opacity-50"
            value={driverPathView.value}
            placeholder={driverPathView.mixed ? "multiple" : "[deviceName]pathToTag"}
            disabled={driverPathView.disabled}
            onblur={(event) => onSave({ driverPath: event.currentTarget.value || null })}
          />
          <BindingEditor
            label="Driver Path"
            binding={bindingMixed("driverPath") ? "" : bindingValue("driverPath")}
            contextDescription="tagConfig and properties"
            scope="tag"
            savedError={bindingMixed("driverPath") ? null : bindingError("driverPath")}
            onBindingSave={(expression) => onBindingSave("driverPath", expression)}
            onBindingRemove={() => onBindingRemove("driverPath")}
          />
        </div>

        <div class="flex items-center gap-2">
          <label class="opacity-60 mr-auto" for="multi-readonly">Readonly</label>
          {@render overrideIndicator("readonly")}
          <input
            id="multi-readonly"
            type="checkbox"
            class="checkbox"
            use:indeterminate={readonlyView.mixed}
            checked={readonlyView.checked}
            disabled={readonlyView.disabled}
            onchange={(event) => onSave({ readonly: event.currentTarget.checked })}
          />
          <BindingEditor
            label="Readonly"
            binding={bindingMixed("readonly") ? "" : bindingValue("readonly")}
            contextDescription="tagConfig and properties"
            scope="tag"
            savedError={bindingMixed("readonly") ? null : bindingError("readonly")}
            onBindingSave={(expression) => onBindingSave("readonly", expression)}
            onBindingRemove={() => onBindingRemove("readonly")}
          />
        </div>

        <div class="flex items-center gap-2">
          <label class="opacity-60" for="multi-writeLevel">Write Level</label>
          {@render overrideIndicator("writeLevel")}
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
          {@render overrideIndicator("exposeOverOpcua")}

          <input
            id="multi-expose"
            type="checkbox"
            class="checkbox"
            use:indeterminate={exposeView.mixed}
            checked={exposeView.checked}
            disabled={exposeView.disabled}
            onchange={(event) => onSave({ exposeOverOpcua: event.currentTarget.checked })}
          />
          <BindingEditor
            label="Expose OPC UA"
            binding={bindingMixed("exposeOverOpcua") ? "" : bindingValue("exposeOverOpcua")}
            contextDescription="tagConfig and properties"
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
          {@render overrideIndicator("trendEnabled")}

          <input
            id="multi-trendEnabled"
            type="checkbox"
            class="checkbox"
            use:indeterminate={trendEnabledView.mixed}
            checked={trendEnabledView.checked}
            disabled={trendEnabledView.disabled}
            onchange={(event) => onSave({ trendEnabled: event.currentTarget.checked })}
          />
          <BindingEditor
            label="Trend Enabled"
            binding={bindingMixed("trendEnabled") ? "" : bindingValue("trendEnabled")}
            contextDescription="tagConfig and properties"
            scope="tag"
            savedError={bindingMixed("trendEnabled") ? null : bindingError("trendEnabled")}
            onBindingSave={(expression) => onBindingSave("trendEnabled", expression)}
            onBindingRemove={() => onBindingRemove("trendEnabled")}
          />
        </div>

        <div class="flex items-center gap-2">
          <label class="opacity-60 mr-auto" for="multi-trendInterval">Minimum interval</label>
          {@render overrideIndicator("trendMinimumSamplingIntervalMs")}

          <input
            id="multi-trendInterval"
            type="number"
            class="input placeholder:opacity-50"
            min="100"
            step="100"
            value={trendIntervalView.value}
            placeholder={trendIntervalView.mixed ? "multiple" : "minimum interval ms"}
            disabled={trendIntervalView.disabled}
            onblur={(event) => {
              if (event.currentTarget.value) {
                onSave({ trendMinimumSamplingIntervalMs: Number(event.currentTarget.value) });
              }
            }}
          />
          <span class="text-xs opacity-60">ms</span>
          <BindingEditor
            label="Trend Interval"
            binding={bindingMixed("trendMinimumSamplingIntervalMs")
              ? ""
              : bindingValue("trendMinimumSamplingIntervalMs")}
            contextDescription="tagConfig and properties"
            scope="tag"
            savedError={bindingMixed("trendMinimumSamplingIntervalMs")
              ? null
              : bindingError("trendMinimumSamplingIntervalMs")}
            onBindingSave={(expression) =>
              onBindingSave("trendMinimumSamplingIntervalMs", expression)}
            onBindingRemove={() => onBindingRemove("trendMinimumSamplingIntervalMs")}
          />
        </div>

        <div class="flex items-start gap-2">
          <Settings2Icon class="size-4 shrink-0 opacity-60 mt-1" />
          <div class="flex flex-col gap-1 flex-1">
            <div class="flex items-center gap-2">
              <label class="opacity-60" for="multi-properties">Properties</label>
              {@render overrideIndicator("properties")}
            </div>
            <textarea
              id="multi-properties"
              rows="4"
              class="input placeholder:opacity-50 py-0 font-mono text-xs"
              value={propertiesView.value}
              placeholder={propertiesView.mixed ? "multiple" : ""}
              disabled={propertiesView.disabled}
              onblur={saveProperties}></textarea>
          </div>
          <BindingEditor
            label="Properties"
            binding={bindingMixed("properties") ? "" : bindingValue("properties")}
            contextDescription="tagConfig and properties"
            scope="tag"
            savedError={bindingMixed("properties") ? null : bindingError("properties")}
            onBindingSave={(expression) => onBindingSave("properties", expression)}
            onBindingRemove={() => onBindingRemove("properties")}
          />
        </div>

        <div class="flex items-center gap-2">
          <Settings2Icon class="size-4 shrink-0 opacity-60" />
          <label class="opacity-60" for="multi-unit">Unit</label>
          {@render overrideIndicator("unit")}

          <input
            id="multi-unit"
            type="text"
            class="input py-0 placeholder:opacity-50"
            value={unitView.value}
            placeholder={unitView.mixed ? "multiple" : ""}
            disabled={unitView.disabled}
            onblur={(event) => onSave({ unit: event.currentTarget.value })}
          />
          <BindingEditor
            label="Unit"
            binding={bindingMixed("unit") ? "" : bindingValue("unit")}
            contextDescription="tagConfig and properties"
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
