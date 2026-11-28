<script lang="ts">
  import { Portal, Popover, Tabs } from "@skeletonlabs/skeleton-svelte";
  import { ChartNoAxesCombinedIcon, Link2Icon } from "@lucide/svelte";
  import type { TagOptionsInput } from "$lib/server/tag/tag";
  import type { TagBindingKey } from "$lib/tagBindings";
  import { tagWriteLevels, type TagWriteLevel } from "$lib/permissions/constants";
  import { attempt } from "$lib/util/attempt";
  import InputWithBinding from "./InputWithBinding.svelte";
  import InputWithBindingSection from "./InputWithBindingSection.svelte";
  import type { InputExtension, InputWithBindingRow } from "$lib/client/editor/elementBindingRows";
  import { isUdtTag } from "$lib/util/tag";
  import type { ScriptPropertyKeyInfo } from "$lib/client/editor/propertyKeys";
  import type { TagProperties } from "$lib/sqlite/tagProperties";
  import type { PropertyMap, PropertyValue } from "$lib/propertyValue";
  import { boundStyle, boundTooltip } from "$lib/client/util/bindingStyle";

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
    propertyKeys?: Iterable<ScriptPropertyKeyInfo>;
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
    propertyKeys,
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

  let propertyRows = $derived.by((): InputWithBindingRow[] => {
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
        binding: "",
        result: "",
        error: null,
      };
    });
  });

  let definitionPropertyRows = $derived(
    Object.entries(definitionProperties).map(([key, property]) => ({
      key,
      value: String(property.value),
      description: property.description,
      required: property.required,
      binding: "",
      result: "",
      error: null,
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

  let showOverrideIndicator = $derived(
    mode === "tag" && tags.length > 0 && tags.every((tag) => isUdtTag(tag)),
  );
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
  let trendIntervalMixed = $derived(
    trendInterval.mixed || stateOf("trendMinimumSamplingIntervalMs").mixed,
  );
  let unitMixed = $derived(unit.mixed || stateOf("unit").mixed);
  let readonlyValue = $derived(readonlyMixed ? "" : String(Boolean(readonly.value)));
  let exposeValue = $derived(exposeMixed ? "" : String(Boolean(exposeOverOpcua.value)));
  let trendEnabledValue = $derived(trendEnabledMixed ? "" : String(Boolean(trendEnabled.value)));

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
   * Builds the input extension for the data type field.
   *
   * @returns A text input when bound, otherwise a select of data types
   */
  function dataTypeInput(): InputExtension {
    if (stateOf("dataType").bound) return { kind: "text" };
    return {
      kind: "select",
      options: [
        ...(dataTypeMixed ? [{ label: "multiple", value: "" }] : []),
        ...dataTypes.map((type) => ({ label: type, value: type })),
      ],
    };
  }

  /**
   * Builds the input extension for the write level field.
   *
   * @returns A text input when bound, otherwise a select of write levels
   */
  function writeLevelInput(): InputExtension {
    if (stateOf("writeLevel").bound) return { kind: "text" };
    return {
      kind: "select",
      options: [
        ...(writeLevelMixed ? [{ label: "multiple", value: "" }] : []),
        ...tagWriteLevels.map((level) => ({ label: level, value: level })),
      ],
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

<Portal>
  <Popover.Positioner>
    <Popover.Content
      class="flex gap-4 bg-surface-100-900 card shadow dark:border-1 border-surface-200-800 p-6 h-[70svh] "
    >
      {#if mode === "udtDefinition"}
        <fieldset class="flex flex-col gap-2" disabled={!canUpdate}>
          <InputWithBindingSection
            title="Properties"
            showHeader={false}
            mode="definition"
            layout="column"
            rows={definitionPropertyRows}
            disabled={!canUpdate}
            onValueCommit={(row, value) =>
              onDefinitionPropertiesChange?.((properties) => ({
                ...properties,
                [row.key]: { ...(properties[row.key] ?? { required: true }), value },
              }))}
            onDescriptionCommit={(row, description) =>
              onDefinitionPropertiesChange?.((properties) => ({
                ...properties,
                [row.key]: {
                  ...(properties[row.key] ?? { required: true }),
                  description: description.trim() || undefined,
                },
              }))}
            onRequiredChange={(row, required) =>
              onDefinitionPropertiesChange?.((properties) => ({
                ...properties,
                [row.key]: { ...(properties[row.key] ?? { value: "" }), required },
              }))}
            onRemoveRow={(row) => {
              onDefinitionPropertiesChange?.((properties) => {
                const next = { ...properties };
                delete next[row.key];
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
                  <ChartNoAxesCombinedIcon class="size-5 opacity-50" />
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
              <InputWithBinding
                label="Data Type"
                layout="column"
                value={dataTypeMixed ? "" : String(dataType.value ?? "")}
                result={dataTypeMixed ? "" : String(dataType.value ?? "")}
                binding={bindingMixed("dataType") ? "" : bindingValue("dataType")}
                savedError={bindingMixed("dataType") ? null : bindingError("dataType")}
                placeholder={dataTypeMixed ? "multiple" : ""}
                disabled={disabledFor("dataType")}
                input={dataTypeInput()}
                bindingScope="tag"
                bindingContextDescription="tagConfig and properties"
                {propertyKeys}
                {showOverrideIndicator}
                overridden={hasOverride("dataType")}
                onOverrideClear={() => onClearOverride("dataType")}
                onBindingSave={(expression) => onBindingSave("dataType", expression)}
                onBindingRemove={() => onBindingRemove("dataType")}
                onValueCommit={(value) => {
                  if (!value) return false;
                  onSave({ dataType: value });
                  return true;
                }}
              />

              <div class="py-2">
                <label class="opacity-60 text-xs" for="multi-properties">Properties</label>
                <div
                  class="flex items-start gap-2"
                  title={stateOf("properties").bound ? boundTooltip : ""}
                  style={boundStyle(stateOf("properties").bound)}
                >
                  <div class="flex-1 min-w-0">
                    <InputWithBindingSection
                      title="Properties"
                      showHeader={false}
                      mode="tag"
                      layout="row"
                      rows={propertyRows}
                      disabled={disabledFor("properties")}
                      {showOverrideIndicator}
                      onValueCommit={(row, value) => updateProperty(row.key, { value })}
                      onOverrideClear={(row) => onPropertyOverrideClear?.(row.key)}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section id="connection" tabindex="-1" class="outline-none">
              <p class="opacity-50 pt-4 pb-2 text-xs font-bold border-b-2 border-primary-400-600">
                Connection
              </p>

              <InputWithBinding
                label="Driver path"
                layout="column"
                value={driverPathMixed ? "" : (driverPath.value ?? "")}
                result={driverPathMixed ? "" : (driverPath.value ?? "")}
                binding={bindingMixed("driverPath") ? "" : bindingValue("driverPath")}
                savedError={bindingMixed("driverPath") ? null : bindingError("driverPath")}
                placeholder={driverPathMixed ? "multiple" : "[deviceName]pathToTag"}
                disabled={disabledFor("driverPath")}
                input={{ kind: "text" }}
                bindingScope="tag"
                bindingContextDescription="tagConfig and properties"
                {propertyKeys}
                {showOverrideIndicator}
                overridden={hasOverride("driverPath")}
                onOverrideClear={() => onClearOverride("driverPath")}
                onBindingSave={(expression) => onBindingSave("driverPath", expression)}
                onBindingRemove={() => onBindingRemove("driverPath")}
                onValueCommit={(value) => {
                  onSave({ driverPath: value || null });
                  return true;
                }}
              />
            </section>

            <section id="security" tabindex="-1" class="outline-none">
              <p class="opacity-50 pt-4 pb-2 text-xs font-bold border-b-2 border-primary-400-600">
                Security
              </p>

              <InputWithBinding
                label="Readonly"
                layout="row"
                value={readonlyValue}
                result={readonlyValue}
                binding={bindingMixed("readonly") ? "" : bindingValue("readonly")}
                savedError={bindingMixed("readonly") ? null : bindingError("readonly")}
                disabled={disabledFor("readonly")}
                input={{ kind: "checkbox", indeterminate: readonlyMixed }}
                bindingScope="tag"
                bindingContextDescription="tagConfig and properties"
                {propertyKeys}
                {showOverrideIndicator}
                overridden={hasOverride("readonly")}
                onOverrideClear={() => onClearOverride("readonly")}
                onBindingSave={(expression) => onBindingSave("readonly", expression)}
                onBindingRemove={() => onBindingRemove("readonly")}
                onValueCommit={(value) => {
                  onSave({ readonly: value === "true" });
                  return true;
                }}
              />

              <InputWithBinding
                label="Write Level"
                layout="column"
                value={writeLevelMixed ? "" : (writeLevel.value ?? "operator")}
                result={writeLevelMixed ? "" : (writeLevel.value ?? "operator")}
                binding={bindingMixed("writeLevel") ? "" : bindingValue("writeLevel")}
                savedError={bindingMixed("writeLevel") ? null : bindingError("writeLevel")}
                placeholder={writeLevelMixed ? "multiple" : ""}
                disabled={disabledFor("writeLevel", canManage)}
                input={writeLevelInput()}
                bindingScope="tag"
                bindingContextDescription="tagConfig and properties"
                {propertyKeys}
                {showOverrideIndicator}
                overridden={hasOverride("writeLevel")}
                onOverrideClear={() => onClearOverride("writeLevel")}
                onBindingSave={(expression) => onBindingSave("writeLevel", expression)}
                onBindingRemove={() => onBindingRemove("writeLevel")}
                onValueCommit={(value) => {
                  if (!value) return false;
                  onSave({ writeLevel: value as TagWriteLevel });
                  return true;
                }}
              />

              <InputWithBinding
                label="Expose Tag On OPCUA Server"
                layout="row"
                value={exposeValue}
                result={exposeValue}
                binding={bindingMixed("exposeOverOpcua") ? "" : bindingValue("exposeOverOpcua")}
                savedError={bindingMixed("exposeOverOpcua")
                  ? null
                  : bindingError("exposeOverOpcua")}
                disabled={disabledFor("exposeOverOpcua")}
                input={{ kind: "checkbox", indeterminate: exposeMixed }}
                bindingScope="tag"
                bindingContextDescription="tagConfig and properties"
                {propertyKeys}
                {showOverrideIndicator}
                overridden={hasOverride("exposeOverOpcua")}
                onOverrideClear={() => onClearOverride("exposeOverOpcua")}
                onBindingSave={(expression) => onBindingSave("exposeOverOpcua", expression)}
                onBindingRemove={() => onBindingRemove("exposeOverOpcua")}
                onValueCommit={(value) => {
                  onSave({ exposeOverOpcua: value === "true" });
                  return true;
                }}
              />
            </section>

            <section id="history" tabindex="-1" class="outline-none">
              <p class="opacity-50 pt-4 pb-2 text-xs font-bold border-b-2 border-primary-400-600">
                History
              </p>

              <InputWithBinding
                label="Enabled"
                layout="row"
                value={trendEnabledValue}
                result={trendEnabledValue}
                binding={bindingMixed("trendEnabled") ? "" : bindingValue("trendEnabled")}
                savedError={bindingMixed("trendEnabled") ? null : bindingError("trendEnabled")}
                disabled={disabledFor("trendEnabled")}
                input={{ kind: "checkbox", indeterminate: trendEnabledMixed }}
                bindingScope="tag"
                bindingContextDescription="tagConfig and properties"
                {propertyKeys}
                {showOverrideIndicator}
                overridden={hasOverride("trendEnabled")}
                onOverrideClear={() => onClearOverride("trendEnabled")}
                onBindingSave={(expression) => onBindingSave("trendEnabled", expression)}
                onBindingRemove={() => onBindingRemove("trendEnabled")}
                onValueCommit={(value) => {
                  onSave({ trendEnabled: value === "true" });
                  return true;
                }}
              />

              <InputWithBinding
                label="Minimum interval"
                layout="column"
                value={trendIntervalMixed ? "" : String(trendInterval.value ?? "")}
                result={trendIntervalMixed ? "" : String(trendInterval.value ?? "")}
                binding={bindingMixed("trendMinimumSamplingIntervalMs")
                  ? ""
                  : bindingValue("trendMinimumSamplingIntervalMs")}
                savedError={bindingMixed("trendMinimumSamplingIntervalMs")
                  ? null
                  : bindingError("trendMinimumSamplingIntervalMs")}
                placeholder={trendIntervalMixed ? "multiple" : "minimum interval ms"}
                disabled={disabledFor("trendMinimumSamplingIntervalMs")}
                input={{ kind: "number", min: 100, step: 100 }}
                suffix="ms"
                bindingScope="tag"
                bindingContextDescription="tagConfig and properties"
                {propertyKeys}
                {showOverrideIndicator}
                overridden={hasOverride("trendMinimumSamplingIntervalMs")}
                onOverrideClear={() => onClearOverride("trendMinimumSamplingIntervalMs")}
                onBindingSave={(expression) =>
                  onBindingSave("trendMinimumSamplingIntervalMs", expression)}
                onBindingRemove={() => onBindingRemove("trendMinimumSamplingIntervalMs")}
                onValueCommit={(value) => {
                  const parsed = Number(value);
                  if (value.trim() === "" || !Number.isFinite(parsed)) return false;
                  onSave({ trendMinimumSamplingIntervalMs: parsed });
                  return true;
                }}
              />
            </section>

            <section id="unit" tabindex="-1" class="outline-none">
              <p class="opacity-50 pt-4 pb-2 text-xs font-bold border-b-2 border-primary-400-600">
                Unit
              </p>

              <InputWithBinding
                label="Unit"
                layout="column"
                value={unitMixed ? "" : (unit.value ?? "")}
                result={unitMixed ? "" : (unit.value ?? "")}
                binding={bindingMixed("unit") ? "" : bindingValue("unit")}
                savedError={bindingMixed("unit") ? null : bindingError("unit")}
                placeholder={unitMixed ? "multiple" : ""}
                disabled={disabledFor("unit")}
                input={{ kind: "text" }}
                bindingScope="tag"
                bindingContextDescription="tagConfig and properties"
                {propertyKeys}
                {showOverrideIndicator}
                overridden={hasOverride("unit")}
                onOverrideClear={() => onClearOverride("unit")}
                onBindingSave={(expression) => onBindingSave("unit", expression)}
                onBindingRemove={() => onBindingRemove("unit")}
                onValueCommit={(value) => {
                  onSave({ unit: value });
                  return true;
                }}
              />
            </section>
          </fieldset>
        </Tabs>
      {/if}
    </Popover.Content>
  </Popover.Positioner>
</Portal>
