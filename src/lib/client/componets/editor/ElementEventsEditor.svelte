<script lang="ts">
  import { getEditorContext } from "$lib/client/editor/editorContext";
  import type { ElementBindings } from "$lib/elements/elementTypes";
  import { toast } from "$lib/client/toast.svelte";
  import ScriptEditor from "./ScriptEditor.svelte";
  import { commitOrRevert } from "$lib/client/util/use";
  import type { ScriptPropertyKeyInfo } from "$lib/client/editor/propertyKeys";

  let { propertyKeys }: { propertyKeys?: Iterable<ScriptPropertyKeyInfo> } = $props();

  const editor = getEditorContext();
  const eventNamePattern = /^[a-z][a-z0-9:_-]*$/i;

  let open = $state(false);
  let events = $state<Array<{ name: string; script: string }>>([]);
  let newEventName = $state("");

  let selected = $derived(
    editor.selectedElementIds.length === 1
      ? editor.elementsCollection?.state[editor.selectedElementIds[0]]
      : null,
  );

  $effect(() => {
    const bindings = selected?.bindings;
    events = Object.entries(bindings?.events ?? {}).map(([name, script]) => ({ name, script }));
  });

  /**
   * Returns a shallow copy of the selected element's bindings.
   *
   * @returns Copy of the current bindings, or an empty object when nothing is selected.
   */
  function currentBindings(): ElementBindings {
    return { ...(selected?.bindings ?? {}) };
  }

  /**
   * Persists bindings on the selected element.
   *
   * @param next - Bindings to save; an empty object stores null.
   */
  function saveBindings(next: ElementBindings) {
    if (!selected) return;
    editor.elementsCollection?.update(selected.id, {
      bindings: Object.keys(next).length > 0 ? next : null,
      updatedAt: Date.now(),
    });
  }

  /**
   * Filters and saves the given event scripts onto the selected element.
   *
   * @param nextEvents - Event name/script pairs to persist.
   */
  function saveEvents(nextEvents: Array<{ name: string; script: string }>) {
    const record: Record<string, string> = {};
    for (const item of nextEvents) {
      if (item.name.trim() && item.script.trim()) record[item.name] = item.script;
    }
    const next = currentBindings();
    if (Object.keys(record).length > 0) next.events = record;
    else delete next.events;
    saveBindings(next);
  }

  /**
   * Validates the new event name and appends an empty event row.
   */
  function addEvent() {
    const name = newEventName.trim().replace(/^on/i, "").toLowerCase();
    if (!name) return;
    if (!eventNamePattern.test(name)) {
      toast({ kind: "error", title: "Invalid event name", description: name });
      return;
    }
    if (events.some((item) => item.name === name)) {
      toast({ kind: "error", title: "Event already exists", description: name });
      return;
    }
    events = [...events, { name, script: "" }];
    newEventName = "";
  }

  /**
   * Removes an event by name and persists the remaining events.
   *
   * @param name - Event name to remove.
   */
  function removeEvent(name: string) {
    events = events.filter((item) => item.name !== name);
    saveEvents(events);
  }

  /**
   * Adds the pending event when Enter is pressed.
   *
   * @param event - Keyboard event from the new event input.
   */
  function onNewEventKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") addEvent();
  }
</script>

<div class="flex flex-col gap-2">
  <button class="btn btn-sm preset-tonal self-start" onclick={() => (open = !open)}>
    {open ? "Hide events" : "Show events"}
  </button>

  {#if open}
    <div class="flex items-center justify-between">
      <span class="opacity-60">Events</span>
      <span class="opacity-40">preview only</span>
    </div>
    <p class="opacity-50">
      Scripts run in a sandbox with no access to <code>window</code>
      ,
      <code>document</code>
      ,
      <code>fetch</code>
      , storage, or cookies. They receive a safe
      <code>event</code>
      snapshot,
      <code>writeTag()</code>
      ,
      <code>goto()</code>
      , and
      <code>toast()</code>
      .
    </p>

    {#each events as item (item.name)}
      <div class="rounded border border-surface-300-700 p-2 flex flex-col gap-1">
        <div class="flex items-center justify-between gap-2">
          <code class="truncate">{item.name}</code>
          <button class="btn btn-sm preset-tonal" onclick={() => removeEvent(item.name)}>
            Remove
          </button>
        </div>
        <ScriptEditor
          value={item.script}
          height="300px"
          ariaLabel={`${item.name} event script`}
          scope="event"
          {propertyKeys}
          onchange={(next) => (item.script = next)}
          onblur={() => saveEvents(events)}
        />
      </div>
    {/each}

    <div class="flex gap-1">
      <input
        class="input placeholder:opacity-50 h-7 py-0 px-2 min-w-0"
        bind:value={newEventName}
        placeholder="click"
        {@attach commitOrRevert(() => addEvent(), "string", undefined, { commitOnBlur: false })}
      />
      <button class="btn btn-sm preset-tonal shrink-0" onclick={addEvent}>Add</button>
    </div>
  {/if}
</div>
