<script lang="ts">
  import { configure } from "svelte-realtime/client";
  import { tagsStream, devicesStream, displaysStream } from "$live/editor";
  import { enablePatches } from "immer";
  import { EditorState } from "$lib/client/versioning/editorState.svelte";

  enablePatches();

  // Offline queue — replaces your SyncQueue + Dexie entirely
  configure({
    offline: {
      queue: true,
      maxQueue: 200,
      maxAge: 5 * 60 * 1000,
      beforeReplay: (call) => Date.now() - call.queuedAt < 5 * 60 * 1000,
      onReplayError: (call, err) => console.warn("Replay failed", call, err),
    },
  });

  // Svelte 5 rune views of each stream
  const remoteTags = tagsStream.rune();
  const remoteDevices = devicesStream.rune();
  const remoteDisplays = displaysStream.rune();

  // Editor is initialised once streams have loaded
  const editor = new EditorState({
    tags: remoteTags ?? {},
    devices: remoteDevices ?? {},
    displays: remoteDisplays ?? {},
  });

  // Apply incoming remote patches (from other users or OPC-UA)
  // without creating undo history entries for this client
  $effect(() => {
    const unsub = tagsStream.subscribe((event) => {
      if (event?.type === "patched") {
        editor.applyRemotePatches("tags", event.data.patches);
      }
    });
    return unsub;
  });

  $effect(() => {
    const unsub = devicesStream.subscribe((event) => {
      if (event?.type === "patched") {
        editor.applyRemotePatches("devices", event.data.patches);
      }
    });
    return unsub;
  });

  $effect(() => {
    const unsub = displaysStream.subscribe((event) => {
      if (event?.type === "patched") {
        editor.applyRemotePatches("displays", event.data.patches);
      }
    });
    return unsub;
  });
</script>

{#if editor.syncError}
  <div class="error">{editor.syncError}</div>
{/if}

<div class="toolbar">
  {#each ["tags", "devices", "displays"] as collection (collection)}
    <button
      disabled={!editor.canUndo}
      onclick={() => editor.undo(collection as CollectionName)}
    >
      Undo {collection}
    </button>
    <button
      disabled={!editor.canRedo}
      onclick={() => editor.redo(collection as CollectionName)}
    >
      Redo {collection}
    </button>
  {/each}
</div>

{#each Object.values(editor.tags) as tag (tag.id)}
  <div class="row">
    <input
      value={tag.name}
      oninput={(e) =>
        editor.mutate("tags", (draft) => {
          draft[tag.id].name = (e.target as HTMLInputElement).value;
        })}
    />
    <span class="value">{tag.value ?? "—"}</span>
    <button onclick={() => editor.deleteTag(tag.id)}>Delete</button>
  </div>
{/each}

{#each Object.values(editor.devices) as device (device.id)}
  <div class="row">
    <input
      value={device.name}
      oninput={(e) =>
        editor.mutate("devices", (draft) => {
          draft[device.id].name = (e.target as HTMLInputElement).value;
        })}
    />
    <button onclick={() => editor.deleteDevice(device.id)}>Delete</button>
  </div>
{/each}

{#each Object.values(editor.displays) as display (display.id)}
  <div class="row">
    <input
      value={display.name}
      oninput={(e) =>
        editor.mutate("displays", (draft) => {
          draft[display.id].name = (e.target as HTMLInputElement).value;
        })}
    />
    <button onclick={() => editor.deleteDisplay(display.id)}>Delete</button>
  </div>
{/each}
