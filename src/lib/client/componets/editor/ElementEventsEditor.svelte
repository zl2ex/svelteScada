<script lang="ts">
  import { getEditorContext } from "$lib/client/editor/editorContext";
  import type { ElementBindings } from "$lib/page/elementTypes";
  import { toast } from "$lib/client/toast.svelte";

  const editor = getEditorContext();
  const eventNamePattern = /^[a-z][a-z0-9:_-]*$/i;

  let open = $state(false);
  let events = $state<Array<{ name: string; script: string }>>([]);
  let newEventName = $state("");

  let selected = $derived(
    editor.selectedElementId ? editor.elements[editor.selectedElementId] : null,
  );

  $effect(() => {
    const bindings = selected?.bindings;
    events = Object.entries(bindings?.events ?? {}).map(([name, script]) => ({ name, script }));
  });

  function currentBindings(): ElementBindings {
    return { ...(selected?.bindings ?? {}) };
  }

  function saveBindings(next: ElementBindings) {
    if (!selected) return;
    editor.elementCollection?.update(selected.id, {
      bindings: Object.keys(next).length > 0 ? next : null,
      updatedAt: Date.now(),
    });
  }

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

  function removeEvent(name: string) {
    events = events.filter((item) => item.name !== name);
    saveEvents(events);
  }

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
      Scripts receive <code>event</code>
      ,
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
        <textarea
          class="input py-1 px-2 font-mono text-[11px]"
          rows="3"
          bind:value={item.script}
          onblur={() => saveEvents(events)}
          placeholder="await writeTag('/folder/tag', 1)"
        ></textarea>
      </div>
    {/each}

    <div class="flex gap-1">
      <input
        class="input h-7 py-0 px-2 min-w-0"
        bind:value={newEventName}
        onkeydown={onNewEventKeydown}
        placeholder="click"
      />
      <button class="btn btn-sm preset-tonal shrink-0" onclick={addEvent}>Add</button>
    </div>
  {/if}
</div>
