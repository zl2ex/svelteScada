<script lang="ts">
  import { Plus, Trash2 } from "@lucide/svelte";
  import { getAbilityContext } from "$lib/client/permissions/abilityContext";
  import { getUdtDefinitionsContext } from "$lib/client/editor/udtDefinitionContext";
  import { attempt } from "$lib/util/attempt";
  import { newId } from "$lib/util/newId";
  import { errorToString, neverThrowErrorToString } from "$lib/util/neverThrow";
  import {
    z_UdtDefinitionInput,
    type UdtDefinitionInput,
    type UdtDefinitionTagInput,
  } from "$lib/sqlite/tables/udt_definitions";
  import { baseTypeKeys } from "$lib/validation/baseTypes";
  import { tagWriteLevels, type TagWriteLevel } from "$lib/permissions/constants";

  const ability = getAbilityContext();
  const collection = getUdtDefinitionsContext();

  let selectedId = $state<string | null>(null);
  let propsText = $state("{}");
  let formError = $state<string | null>(null);

  let selectedDefinition = $derived(
    selectedId ? collection.state[selectedId] : undefined,
  );

  let definitions = $derived(
    Object.values(collection.state).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
    ),
  );

  let dataTypes = $derived(
    [...baseTypeKeys, ...definitions.map((definition) => definition.name)].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
    ),
  );

  function defaultChild(): UdtDefinitionTagInput {
    return {
      id: newId(),
      name: "NewChild",
      dataType: "Double",
      type: "tag",
      initalValue: null,
      nodeId: null,
      writeable: true,
      exposeOverOpcua: true,
      parameters: null,
      unit: "",
      bindings: null,
      writeLevel: "operator",
      trendEnabled: false,
      trendMinimumSamplingIntervalMs: 1000,
    };
  }

  function selectDefinition(id: string) {
    const definition = collection.state[id];
    if (!definition) return;
    selectedId = id;
    propsText = JSON.stringify(definition.props, null, 2);
    formError = null;
  }

  function addDefinition() {
    const id = newId();
    const definition: UdtDefinitionInput = {
      id,
      name: uniqueName("NewUdt"),
      props: {},
      children: [],
    };
    collection.add(definition);
    selectDefinition(id);
  }

  function uniqueName(base: string) {
    const names = new Set(definitions.map((definition) => definition.name));
    let name = base;
    let count = 1;
    while (names.has(name)) name = `${base}${count++}`;
    return name;
  }

  function updateDefinition(changes: Partial<Omit<UdtDefinitionInput, "id">>) {
    const current = selectedDefinition;
    if (!current) return false;

    const next = {
      ...current,
      ...changes,
      children: [...(changes.children ?? current.children)].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
      ),
    };

    const parsed = z_UdtDefinitionInput.safeParse(next);
    if (!parsed.success) {
      formError = parsed.error.message;
      return false;
    }

    const { id, ...rest } = parsed.data;
    collection.update(id, rest);
    formError = null;
    return true;
  }

  function updateChild(childId: string, changes: Partial<UdtDefinitionTagInput>) {
    if (!selectedDefinition) return false;

    return updateDefinition({
      children: selectedDefinition.children.map((child) =>
        child.id === childId ? { ...child, ...changes } : child,
      ),
    });
  }

  function saveProps() {
    const parsed = attempt(() => JSON.parse(propsText));
    if (parsed.isErr) {
      formError = `props JSON: ${errorToString(parsed.error)}`;
      return;
    }

    updateDefinition({ props: parsed.data });
  }

  function deleteDefinition() {
    if (!selectedId) return;
    collection.remove(selectedId);
    selectedId = null;
    propsText = "{}";
    formError = null;
  }

  function addChild() {
    if (!selectedDefinition) return;
    updateDefinition({
      children: [...selectedDefinition.children, defaultChild()],
    });
  }

  function removeChild(id: string) {
    if (!selectedDefinition) return;
    updateDefinition({
      children: selectedDefinition.children.filter((child) => child.id !== id),
    });
  }

  function canManage() {
    return ability.can("manage", "UdtDefinition");
  }
</script>

<div class="flex h-full min-h-0 flex-col gap-2 p-2">
  <div class="flex items-center gap-2">
    <button class="btn btn-sm preset-filled flex-1" onclick={addDefinition} disabled={!canManage()}>
      <Plus class="size-4" /> New UDT
    </button>
  </div>

  <div class="max-h-44 overflow-y-auto rounded border border-surface-300-700">
    {#each definitions as definition (definition.id)}
      <button
        type="button"
        class="flex w-full items-center justify-between gap-2 border-b border-surface-200-800 px-2 py-1 text-left last:border-b-0 hover:bg-surface-200-800"
        class:bg-surface-300-700={selectedId === definition.id}
        onclick={() => selectDefinition(definition.id)}
      >
        <span class="truncate">{definition.name}</span>
        <span class="text-[10px] opacity-60">{definition.children.length}</span>
      </button>
    {:else}
      <p class="p-2 opacity-60">No UDT definitions.</p>
    {/each}
  </div>

  {#if selectedDefinition}
    <fieldset
      class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto"
      disabled={!canManage()}
    >
      <div class="flex items-center gap-2">
        <label class="w-16 opacity-60" for="udt-name">Name</label>
        <input
          id="udt-name"
          class="input flex-1 py-0"
          value={selectedDefinition.name}
          onblur={(event) => {
            if (!updateDefinition({ name: event.currentTarget.value })) {
              event.currentTarget.value = selectedDefinition.name;
            }
          }}
          onkeydown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
      </div>

      <label class="opacity-60" for="udt-props">Props (JSON)</label>
      <textarea
        id="udt-props"
        class="input min-h-20 font-mono text-xs"
        bind:value={propsText}
        onchange={saveProps}
      ></textarea>

      <div class="flex items-center justify-between">
        <p class="font-semibold">Children</p>
        <button type="button" class="btn btn-sm preset-tonal" onclick={addChild}>
          <Plus class="size-3.5" /> Child
        </button>
      </div>

      {#each selectedDefinition.children as child (child.id)}
        <div class="rounded border border-surface-300-700 p-2">
          <div class="mb-2 flex items-center gap-2">
            <input
              class="input flex-1 py-0"
              value={child.name}
              placeholder="Name"
              onblur={(event) => {
                if (!updateChild(child.id, { name: event.currentTarget.value })) {
                  event.currentTarget.value = child.name;
                }
              }}
              onkeydown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
            <button
              type="button"
              class="btn-icon btn-icon-sm preset-tonal-error"
              onclick={() => removeChild(child.id)}
              aria-label="Remove child"
            >
              <Trash2 class="size-4" />
            </button>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <label class="flex flex-col gap-1">
              <span class="opacity-60">Data type</span>
              <select
                class="select py-0"
                value={child.dataType}
                onchange={(event) =>
                  updateChild(child.id, { dataType: event.currentTarget.value })}
              >
                {#each dataTypes as dataType}
                  <option value={dataType}>{dataType}</option>
                {/each}
              </select>
            </label>

            <label class="flex flex-col gap-1">
              <span class="opacity-60">Write level</span>
              <select
                class="select py-0"
                value={child.writeLevel}
                onchange={(event) =>
                  updateChild(child.id, {
                    writeLevel: event.currentTarget.value as TagWriteLevel,
                  })}
              >
                {#each tagWriteLevels as level}
                  <option value={level}>{level}</option>
                {/each}
              </select>
            </label>

            <label class="col-span-2 flex flex-col gap-1">
              <span class="opacity-60">Node id</span>
              <input
                class="input py-0"
                value={child.nodeId ?? ""}
                placeholder="[device]path"
                onblur={(event) =>
                  updateChild(child.id, { nodeId: event.currentTarget.value || null })}
              />
            </label>

            <label class="flex flex-col gap-1">
              <span class="opacity-60">Unit</span>
              <input
                class="input py-0"
                value={child.unit}
                onblur={(event) => updateChild(child.id, { unit: event.currentTarget.value })}
              />
            </label>

            <label class="flex items-center gap-2 pt-4">
              <input
                type="checkbox"
                class="checkbox"
                checked={child.writeable ?? true}
                onchange={(event) =>
                  updateChild(child.id, { writeable: event.currentTarget.checked })}
              />
              <span>Writeable</span>
            </label>

            <label class="flex items-center gap-2">
              <input
                type="checkbox"
                class="checkbox"
                checked={child.exposeOverOpcua ?? true}
                onchange={(event) =>
                  updateChild(child.id, { exposeOverOpcua: event.currentTarget.checked })}
              />
              <span>Expose OPC UA</span>
            </label>

            <label class="flex items-center gap-2">
              <input
                type="checkbox"
                class="checkbox"
                checked={child.trendEnabled ?? false}
                onchange={(event) =>
                  updateChild(child.id, { trendEnabled: event.currentTarget.checked })}
              />
              <span>Trend</span>
            </label>

            <label class="col-span-2 flex flex-col gap-1">
              <span class="opacity-60">Trend interval (ms)</span>
              <input
                type="number"
                min="100"
                class="input py-0"
                value={child.trendMinimumSamplingIntervalMs ?? 1000}
                onchange={(event) => {
                  const value = Number(event.currentTarget.value);
                  if (!updateChild(child.id, { trendMinimumSamplingIntervalMs: value })) {
                    event.currentTarget.value = String(
                      child.trendMinimumSamplingIntervalMs ?? 1000,
                    );
                  }
                }}
              />
            </label>
          </div>
        </div>
      {/each}

      {#if formError}
        <p class="text-error-700-300">{formError}</p>
      {/if}
      {#if collection.syncError}
        <p class="text-error-700-300">
          {typeof collection.syncError === "string"
            ? collection.syncError
            : neverThrowErrorToString(collection.syncError)}
        </p>
      {/if}

      <div class="flex gap-2">
        <button type="button" class="btn preset-tonal-error" onclick={deleteDefinition}>
          Delete
        </button>
      </div>
    </fieldset>
  {/if}
</div>
