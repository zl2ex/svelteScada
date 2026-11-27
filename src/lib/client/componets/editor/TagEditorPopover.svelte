<script lang="ts">
  import { Portal, Popover, Tabs } from "@skeletonlabs/skeleton-svelte";
  import { ChartNoAxesCombinedIcon, Link2Icon } from "@lucide/svelte";
  import type { TagOptionsInput } from "$lib/server/tag/tag";
  import type { TagBindingKey } from "$lib/tagBindings";
  import { tagWriteLevels, type TagWriteLevel } from "$lib/permissions/constants";
  import { attempt } from "$lib/util/attempt";
  import BindingEditor from "./BindingEditor.svelte";
  import PropertyRowsEditor, { type PropertyRow } from "./PropertyRowsEditor.svelte";
  import type { TagProperties } from "$lib/sqlite/tagProperties";
  import type { PropertyMap, PropertyValue } from "$lib/propertyValue";
  import { fieldStyle } from "$lib/client/util/bindingStyle";
  import { commitOrRevert } from "$lib/client/util/use";

  type Props = {
    tags: TagOptionsInput[];
    dataTypes: string[];
    canUpdate: boolean;
    canManage: boolean;
    bindingValue: (key: TagBindingKey) => string;
    bindingMixed: (key: TagBindingKey) => boolean;
    bindingError: (key: TagBindingKey) => string | null;
    bindingState: (key: TagBindingKey) => {
      bound: boolean;
      mixed: boolean;
    };
    hasOverride: (key: string) => boolean;
    onSave: (changes: Partial<Omit<TagOptionsInput, "id">>) => void;
    onBindingSave: (key: TagBindingKey, expression: string) => void;
    onBindingRemove: (key: TagBindingKey) => void;
    onClearOverride: (key: string) => void;
    onPropertiesChange: (updater: (properties: TagProperties) => TagProperties) => void;
    lockedPropertyKeys?: Set<string>;
    mode?: "tag" | "udtDefinition";
    definitionProperties?: PropertyMap;
    onDefinitionPropertiesChange?: (updater: (properties: PropertyMap) => PropertyMap) => void;
    propertyOverride?: (key: string) => boolean;
    onPropertyOverrideClear?: (key: string) => void;
  };

  let {
    tags,
    dataTypes,
    canUpdate,
    canManage,
    bindingValue,
    bindingMixed,
    bindingError,
    bindingState,
    hasOverride,
    onSave,
    onBindingSave,
    onBindingRemove,
    onClearOverride,
    onPropertiesChange,
    lockedPropertyKeys = new Set<string>(),
    mode = "tag",
    definitionProperties = {},
    onDefinitionPropertiesChange,
    propertyOverride,
    onPropertyOverrideClear,
  }: Props = $props();

  /**
   * Reads a tag field and reports whether values differ across tags.
   *
   * @param read - Selector reading the field from a tag.
   * @returns The shared value and a mixed flag.
   */
  function valueOf<T>(read: (tag: TagOptionsInput) => T) {
    if (tags.length === 0) return { mixed: false, value: undefined as T | undefined };
    const first = read(tags[0]);
    const mixed = tags.some((tag) => !Object.is(read(tag), first));
    return mixed
      ? { mixed: true, value: undefined as T | undefined }
      : { mixed: false, value: first };
  }

  /**
   * Reads and JSON-serializes a tag field to compare values across tags.
   *
   * @param read - Selector reading the field from a tag.
   * @returns The serialized shared value and a mixed flag.
   */
  function jsonValueOf(read: (tag: TagOptionsInput) => unknown) {
    if (tags.length === 0) return { mixed: false, value: undefined as string | undefined };
    const values = tags.map((tag) => JSON.stringify(read(tag) ?? null));
    const mixed = values.some((value) => value !== values[0]);
    return mixed ? { mixed: true, value: undefined } : { mixed: false, value: values[0] };
  }

  let propertyRows = $derived.by((): PropertyRow[] => {
    const maps = tags.map((tag) => (tag.properties ?? {}) as TagProperties);
    if (maps.length === 0) return [];
    const keys = [...new Set(maps.flatMap((map) => Object.keys(map)))]
      .filter((key) => maps.every((map) => Object.hasOwn(map, key)))
      .sort();
    return keys.map((key) => {
      const values = maps.map((map) => map[key]);
      const first = values[0];
      const sameValue = values.every((property) => Object.is(property?.value, first?.value));
      const sameDescription = values.every(
        (property) => (property?.description ?? "") === (first?.description ?? ""),
      );
      return {
        key,
        value: sameValue ? String(first?.value ?? "") : "",
        description: sameDescription ? first?.description : undefined,
        required: values.some((property) => property?.required ?? true),
        locked: lockedPropertyKeys.has(key),
        placeholder: sameValue ? undefined : "<multiple_values>",
        overridden: propertyOverride?.(key) ?? false,
      };
    });
  });

  let definitionPropertyRows = $derived(
    Object.entries(definitionProperties).map(([key, property]) => ({
      key,
      value: String(property.value),
      description: property.description,
      required: property.required,
    })),
  );

  /**
   * Merges a patch into a tag property and publishes the change.
   *
   * @param key - Property name to update.
   * @param patch - Partial property value to merge.
   */
  function updateProperty(key: string, patch: Partial<PropertyValue>) {
    onPropertiesChange((properties) => {
      const next = { ...properties };
      next[key] = { ...(next[key] ?? { value: "", required: true }), ...patch };
      return next;
    });
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

  let dataTypeMixed = $derived(dataType.mixed || stateOf("dataType").mixed);
  let driverPathMixed = $derived(driverPath.mixed || stateOf("driverPath").mixed);
  let readonlyMixed = $derived(readonly.mixed || stateOf("readonly").mixed);
  let writeLevelMixed = $derived(writeLevel.mixed || stateOf("writeLevel").mixed);
  let exposeMixed = $derived(exposeOverOpcua.mixed || stateOf("exposeOverOpcua").mixed);
  let trendEnabledMixed = $derived(trendEnabled.mixed || stateOf("trendEnabled").mixed);
  let trendIntervalMixed = $derived(trendInterval.mixed || stateOf("trendMinimumSamplingIntervalMs").mixed);
  let unitMixed = $derived(unit.mixed || stateOf("unit").mixed);

  /**
   * Returns the effective binding state for a field without evaluating its script.
   *
   * @param key - Binding key to inspect.
   * @returns Effective binding state for the field.
   */
  function stateOf(key: TagBindingKey) {
    return bindingState(key);
  }

  /**
   * Returns whether the field should be disabled because it is bound or read-only.
   *
   * @param key - Binding key to inspect.
   * @param [editable] - Whether the field is editable (defaults to canUpdate).
   * @returns True when the field is bound or not editable.
   */
  function disabledFor(key: TagBindingKey, editable = canUpdate) {
    return stateOf(key).bound || !editable;
  }

  /**
   * Sets the native checkbox indeterminate state.
   *
   * @param node - Checkbox input to update.
   * @param value - Whether the checkbox is indeterminate.
   * @returns Action with an update method for reactive changes.
   */
  function indeterminate(node: HTMLInputElement, value: boolean) {
    node.indeterminate = value;
    return {
      /**
       * Updates the native indeterminate state.
       *
       * @param next - Whether the checkbox is indeterminate.
       */
      update(next: boolean) {
        node.indeterminate = next;
      },
    };
  }

  const sectionLinks = [
    {
      id: "basic",
      label: "Basic",
      propsInSection: ["dataType", "properties"] satisfies TagBindingKey[],
    },
    {
      id: "connection",
      label: "Connection",
      propsInSection: ["driverPath"] satisfies TagBindingKey[],
    },
    {
      id: "security",
      label: "Security",
      propsInSection: ["readonly", "writeLevel"] satisfies TagBindingKey[],
    },
    {
      id: "history",
      label: "History",
      propsInSection: ["trendEnabled", "trendMinimumSamplingIntervalMs"] satisfies TagBindingKey[],
    },
    { id: "unit", label: "Unit", propsInSection: ["unit"] satisfies TagBindingKey[] },
  ] as const;

  type TagEditPopoverSections = typeof sectionLinks;

  let sectionsElement = $state<HTMLFieldSetElement>();
  let activeSection = $state<string>("basic");

  /**
   * Returns whether any tag in the section has a base or UDT override binding.
   *
   * @param section - Section definition to inspect.
   * @returns True when any tag has a binding for a field in the section.
   */
  function isBindingsForSection(section: TagEditPopoverSections[number]) {
    return tags.some((tag) =>
      section.propsInSection.some(
        (key) => key in (tag.bindings ?? {}) || key in (tag.udtOverrides?.bindings ?? {}),
      ),
    );
  }

  /**
   * Scrolls to and focuses a popover section by ID.
   *
   * @param id - Section element ID.
   */
  function focusSection(id: string) {
    if (!sectionsElement) return;
    const section = sectionsElement.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (!section) return;

    const rootRect = sectionsElement.getBoundingClientRect();
    const sectionRect = section.getBoundingClientRect();
    const top = sectionsElement.scrollTop + sectionRect.top - rootRect.top;

    sectionsElement.scrollTo({ top, behavior: "smooth" });
    section.focus({ preventScroll: true });
  }

  /**
   * Finds the section currently at the popover's reading line.
   *
   * @returns The active section ID, or null when unavailable.
   */
  function sectionAtReadingLine() {
    if (!sectionsElement) return null;
    const line = sectionsElement.getBoundingClientRect().top + sectionsElement.clientHeight * 0.2;

    let current: string | null = null;
    for (const { id } of sectionLinks) {
      const section = sectionsElement.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
      if (!section) continue;
      if (section.getBoundingClientRect().top > line) break;
      current = id;
    }
    return current;
  }

  $effect(() => {
    const root = sectionsElement;
    if (!root || typeof IntersectionObserver === "undefined") return;

    const targets = sectionLinks.flatMap(({ id }) => {
      const section = root.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
      return section ? [section] : [];
    });
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) activeSection = visible[0].target.id;
      },
      { root, rootMargin: "-15% 0px -75% 0px", threshold: 0 },
    );

    const lastTarget = targets.at(-1);
    const lastObserver = lastTarget
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (root.scrollHeight > root.clientHeight + 1 && entry.intersectionRatio >= 1) {
                activeSection = entry.target.id;
                continue;
              }
              activeSection = sectionAtReadingLine() ?? activeSection;
            }
          },
          { root, threshold: 1 },
        )
      : null;

    for (const target of targets) observer.observe(target);
    if (lastTarget) lastObserver?.observe(lastTarget);

    return () => {
      observer.disconnect();
      lastObserver?.disconnect();
    };
  });
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
      class="flex gap-4 bg-surface-100-900 card shadow dark:border-1 border-surface-200-800 p-6 h-[70svh] "
    >
      {#if mode === "udtDefinition"}
        <fieldset class="flex flex-col gap-2" disabled={!canUpdate}>
          <PropertyRowsEditor
            title="Properties"
            mode="definition"
            rows={definitionPropertyRows}
            onValueCommit={(key, value) =>
              onDefinitionPropertiesChange?.((properties) => ({
                ...properties,
                [key]: { ...(properties[key] ?? { required: true }), value },
              }))}
            onDescriptionCommit={(key, description) =>
              onDefinitionPropertiesChange?.((properties) => ({
                ...properties,
                [key]: {
                  ...(properties[key] ?? { required: true }),
                  description: description.trim() || undefined,
                },
              }))}
            onRequiredChange={(key, required) =>
              onDefinitionPropertiesChange?.((properties) => ({
                ...properties,
                [key]: { ...(properties[key] ?? { value: "" }), required },
              }))}
            onRemove={(key) => {
              onDefinitionPropertiesChange?.((properties) => {
                const next = { ...properties };
                delete next[key];
                return next;
              });
            }}
            onAdd={(key, value, description, required) => {
              if (Object.hasOwn(definitionProperties, key)) return false;
              onDefinitionPropertiesChange?.((properties) => ({
                ...properties,
                [key]: { value, description: description.trim() || undefined, required },
              }));
              return true;
            }}
          />
        </fieldset>
      {:else}
        <Tabs
          value={activeSection}
          onValueChange={(details) => {
            if (!details.value) return;
            activeSection = details.value;
            focusSection(details.value);
          }}
          orientation="vertical"
          class="shrink-0"
        >
          <Tabs.List class="flex flex-col shrink-0 gap-1">
            {#each sectionLinks as section (section.id)}
              <Tabs.Trigger value={section.id} class="justify-start opacity-70">
                {section.label}
                {#if isBindingsForSection(section)}
                  <Link2Icon class="size-5" />
                {/if}
                {#if tags.find((tag) => tag.trendEnabled) && section.id == "history"}
                  <ChartNoAxesCombinedIcon class="size-5" />
                {/if}
              </Tabs.Trigger>
            {/each}
            <Tabs.Indicator />
          </Tabs.List>
          <fieldset
            bind:this={sectionsElement}
            class="flex flex-col gap-2 overflow-y-scroll p-4"
            disabled={!canUpdate}
          >
            <section id="basic" tabindex="-1" class="outline-none flex flex-col gap-2">
              <p class="opacity-50 pt-4 pb-2 text-xs font-bold border-b-2 border-primary-400-600">
                Basic
              </p>
              <div class="py-2">
                <label class="opacity-60 text-xs" for="multi-dataType">Data Type</label>
                <div class="flex items-center gap-2">
                  {#if stateOf("dataType").bound}
                    <input
                      id="multi-dataType"
                      class="input py-1.5"
                      style={fieldStyle({ bound: true })}
                      value={dataTypeMixed ? "" : dataType.value}
                      placeholder={dataTypeMixed ? "multiple" : ""}
                      disabled
                    />
                  {:else}
                    <select
                      id="multi-dataType"
                      class="select py-1.5"
                      value={dataTypeMixed ? "" : dataType.value}
                      disabled={!canUpdate}
                      {@attach commitOrRevert((value) => {
                        if (value) onSave({ dataType: value });
                      })}
                    >
                      {#if dataTypeMixed}
                        <option value="" disabled>multiple</option>
                      {/if}
                      {#each dataTypes as type (type)}
                        <option value={type}>{type}</option>
                      {/each}
                    </select>
                  {/if}
                  {@render overrideIndicator("dataType")}
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
              </div>

              <div class="py-2">
                <label class="opacity-60 text-xs" for="multi-properties">Properties</label>
                <div
                  class="flex items-start gap-2"
                  style={fieldStyle({ bound: stateOf("properties").bound })}
                >
                  <div class="flex-1 min-w-0">
                    <PropertyRowsEditor
                      title="Properties"
                      mode="view"
                      rows={propertyRows}
                      disabled={disabledFor("properties")}
                      onValueCommit={(key, value) => updateProperty(key, { value })}
                      onOverrideClear={onPropertyOverrideClear}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section id="connection" tabindex="-1" class="outline-none">
              <p class="opacity-50 pt-4 pb-2 text-xs font-bold border-b-2 border-primary-400-600">
                Connection
              </p>

              <div class="py-2">
                <label class="opacity-60 text-xs" for="multi-driverPath">Driver path</label>
                <div class="flex items-center gap-2">
                  <input
                    id="multi-driverPath"
                    type="text"
                    class="input py-0 placeholder:opacity-50"
                    style={fieldStyle({ bound: stateOf("driverPath").bound })}
                    value={driverPathMixed ? "" : driverPath.value}
                    placeholder={driverPathMixed ? "multiple" : "[deviceName]pathToTag"}
                    disabled={disabledFor("driverPath")}
                    {@attach commitOrRevert((value) => onSave({ driverPath: value || null }))}
                  />
                  {@render overrideIndicator("driverPath")}
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
              </div>
            </section>
            <section id="security" tabindex="-1" class="outline-none">
              <p class="opacity-50 pt-4 pb-2 text-xs font-bold border-b-2 border-primary-400-600">
                Security
              </p>

              <div class="py-2 flex items-center justify-between">
                <label class="opacity-60 text-xs" for="multi-readonly">Readonly</label>
                <div class="flex items-center gap-2">
                  <input
                    id="multi-readonly"
                    type="checkbox"
                    class="checkbox"
                    style={fieldStyle({ bound: stateOf("readonly").bound })}
                    use:indeterminate={readonlyMixed}
                    checked={readonlyMixed ? false : Boolean(readonly.value)}
                    disabled={disabledFor("readonly")}
                    onchange={(event) => onSave({ readonly: event.currentTarget.checked })}
                  />
                  {@render overrideIndicator("readonly")}
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
              </div>

              <div class="py-2">
                <label class="opacity-60 text-xs" for="multi-writeLevel">Write Level</label>
                <div class="flex items-center gap-2">
                  {#if stateOf("writeLevel").bound}
                    <input
                      id="multi-writeLevel"
                      class="input py-1.5 flex-1"
                      style={fieldStyle({ bound: true })}
                      value={writeLevelMixed ? "" : writeLevel.value}
                      placeholder={writeLevelMixed ? "multiple" : ""}
                      disabled
                    />
                  {:else}
                    <select
                      id="multi-writeLevel"
                      class="select py-1.5 flex-1"
                      value={writeLevelMixed ? "" : writeLevel.value}
                      disabled={!canManage}
                      {@attach commitOrRevert((value) => {
                        if (value) onSave({ writeLevel: value as TagWriteLevel });
                      })}
                    >
                      {#if writeLevelMixed}
                        <option value="" disabled>multiple</option>
                      {/if}
                      {#each tagWriteLevels as level}
                        <option value={level}>{level}</option>
                      {/each}
                    </select>
                  {/if}
                  {@render overrideIndicator("writeLevel")}
                  <BindingEditor
                    label="Write Level"
                    binding={bindingMixed("writeLevel") ? "" : bindingValue("writeLevel")}
                    contextDescription="tagConfig and properties"
                    scope="tag"
                    savedError={bindingMixed("writeLevel") ? null : bindingError("writeLevel")}
                    onBindingSave={(expression) => onBindingSave("writeLevel", expression)}
                    onBindingRemove={() => onBindingRemove("writeLevel")}
                  />
                </div>
              </div>

              <div class="py-2 flex items-center justify-between">
                <label class="opacity-60 text-xs" for="multi-expose">
                  Expose Tag On OPCUA Server
                </label>
                <div class="flex items-center gap-2">
                  <input
                    id="multi-expose"
                    type="checkbox"
                    class="checkbox"
                    style={fieldStyle({ bound: stateOf("exposeOverOpcua").bound })}
                    use:indeterminate={exposeMixed}
                    checked={exposeMixed ? false : Boolean(exposeOverOpcua.value)}
                    disabled={disabledFor("exposeOverOpcua")}
                    onchange={(event) => onSave({ exposeOverOpcua: event.currentTarget.checked })}
                  />
                  {@render overrideIndicator("exposeOverOpcua")}
                  <BindingEditor
                    label="Expose OPC UA"
                    binding={bindingMixed("exposeOverOpcua") ? "" : bindingValue("exposeOverOpcua")}
                    contextDescription="tagConfig and properties"
                    scope="tag"
                    savedError={bindingMixed("exposeOverOpcua")
                      ? null
                      : bindingError("exposeOverOpcua")}
                    onBindingSave={(expression) => onBindingSave("exposeOverOpcua", expression)}
                    onBindingRemove={() => onBindingRemove("exposeOverOpcua")}
                  />
                </div>
              </div>
            </section>

            <section id="history" tabindex="-1" class="outline-none">
              <p class="opacity-50 pt-4 pb-2 text-xs font-bold border-b-2 border-primary-400-600">
                History
              </p>

              <div class="py-2 flex items-center justify-between">
                <label class="opacity-60 text-xs" for="multi-trendEnabled">Enabled</label>
                <div class="flex items-center gap-2">
                  <input
                    id="multi-trendEnabled"
                    type="checkbox"
                    class="checkbox"
                    style={fieldStyle({ bound: stateOf("trendEnabled").bound })}
                    use:indeterminate={trendEnabledMixed}
                    checked={trendEnabledMixed ? false : Boolean(trendEnabled.value)}
                    disabled={disabledFor("trendEnabled")}
                    onchange={(event) => onSave({ trendEnabled: event.currentTarget.checked })}
                  />
                  {@render overrideIndicator("trendEnabled")}
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
              </div>

              <div class="py-2">
                <label class="opacity-60 text-xs" for="multi-trendInterval">Minimum interval</label>
                <div class="flex items-center gap-2">
                  <input
                    id="multi-trendInterval"
                    type="number"
                    class="input placeholder:opacity-50"
                    style={fieldStyle({ bound: stateOf("trendMinimumSamplingIntervalMs").bound })}
                    min="100"
                    step="100"
                    value={trendIntervalMixed ? "" : trendInterval.value}
                    placeholder={trendIntervalMixed ? "multiple" : "minimum interval ms"}
                    disabled={disabledFor("trendMinimumSamplingIntervalMs")}
                    {@attach commitOrRevert(
                      (value) => {
                        if (value === null) return false;
                        onSave({ trendMinimumSamplingIntervalMs: value });
                      },
                      "number",
                    )}
                  />
                  <span class="text-xs opacity-60">ms</span>
                  {@render overrideIndicator("trendMinimumSamplingIntervalMs")}
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
              </div>
            </section>

            <section id="unit" tabindex="-1" class="outline-none">
              <p class="opacity-50 pt-4 pb-2 text-xs font-bold border-b-2 border-primary-400-600">
                Unit
              </p>

              <div class="py-2">
                <label class="opacity-60 text-xs" for="multi-unit">Unit</label>
                <div class="flex items-center gap-2">
                  <input
                    id="multi-unit"
                    type="text"
                    class="input py-0 placeholder:opacity-50"
                    style={fieldStyle({ bound: stateOf("unit").bound })}
                    value={unitMixed ? "" : unit.value}
                    placeholder={unitMixed ? "multiple" : ""}
                    disabled={disabledFor("unit")}
                    {@attach commitOrRevert((value) => onSave({ unit: value }))}
                  />
                  {@render overrideIndicator("unit")}
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
              </div>
            </section>
          </fieldset>
        </Tabs>
      {/if}
    </Popover.Content>
  </Popover.Positioner>
</Portal>
