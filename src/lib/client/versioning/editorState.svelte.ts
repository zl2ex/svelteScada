import { produceWithPatches, applyPatches, enablePatches } from "immer";
import type { Patch } from "immer";
import { applyMutation } from "$live/editor";
import { squashPatches } from "$lib/client/versioning/patches";
import type { Collections, CollectionName } from "$lib/types";
import type { Tag, Device, Display } from "$lib/server/sqlite/schema";

enablePatches();

const SAVE_MARKER = Symbol("SAVE_MARKER");

interface HistoryEntry {
  patches: Patch[];
  inversePatches: Patch[];
}

type StackEntry = HistoryEntry | typeof SAVE_MARKER;

interface CollectionStack {
  past: StackEntry[];
  future: StackEntry[];
}

export class EditorState {
  tags = $state<Record<string, Tag>>({});
  devices = $state<Record<string, Device>>({});
  displays = $state<Record<string, Display>>({});
  syncError = $state<string | null>(null);

  #history: Record<CollectionName, CollectionStack> = {
    tags: { past: [], future: [] },
    devices: { past: [], future: [] },
    displays: { past: [], future: [] },
  };

  // Debounce timers — all collections use 300ms debounce before sending
  #debounce = new Map<CollectionName, ReturnType<typeof setTimeout>>();

  // Pending patches per collection accumulated during debounce window
  #pending = new Map<CollectionName, Patch[]>();

  constructor(initial: Collections) {
    this.tags = initial.tags;
    this.devices = initial.devices;
    this.displays = initial.displays;
  }

  // --- Mutations ---

  mutate<K extends CollectionName>(
    collection: K,
    recipe: (draft: Collections[K]) => void,
  ): void {
    const current = this[collection] as Collections[K];
    const [next, patches, inversePatches] = produceWithPatches(current, recipe);

    this.#history[collection].past.push({ patches, inversePatches });
    this.#history[collection].future = [];
    (this[collection] as Collections[K]) = next;

    this.#scheduleSend(collection, patches);
  }

  deleteTag(id: string): void {
    this.mutate("tags", (draft) => {
      delete draft[id];
    });
  }
  deleteDevice(id: string): void {
    this.mutate("devices", (draft) => {
      delete draft[id];
    });
  }
  deleteDisplay(id: string): void {
    this.mutate("displays", (draft) => {
      delete draft[id];
    });
  }

  // --- Debounced send ---

  #scheduleSend(collection: CollectionName, patches: Patch[]): void {
    // Accumulate patches during the debounce window
    const accumulated = this.#pending.get(collection) ?? [];
    this.#pending.set(collection, [...accumulated, ...patches]);

    clearTimeout(this.#debounce.get(collection));
    this.#debounce.set(
      collection,
      setTimeout(() => void this.#flush(collection), 300),
    );
  }

  async #flush(collection: CollectionName): Promise<void> {
    const patches = this.#pending.get(collection) ?? [];
    if (patches.length === 0) return;
    this.#pending.delete(collection);

    const squashed = squashPatches(patches);

    try {
      // applyMutation is a live.validated remote function —
      // called like a local async function, runs on server via WebSocket
      const result = await applyMutation({ collection, patches: squashed });

      // For tags: server returns enriched patches (resolved OPC-UA values etc.)
      // Merge them back without creating a history entry
      if (result?.patches && collection === "tags") {
        this.#mergeServerResponse("tags", result.patches);
      }

      this.syncError = null;
    } catch (err) {
      this.syncError = `Sync failed: ${(err as Error).message}`;

      // Roll back all history entries that haven't been confirmed
      // by working backwards through the patches we just tried to send
      for (const patch of squashed.slice().reverse()) {
        const stack = this.#history[collection];
        const entry = stack.past.findLast(
          (e) =>
            e !== SAVE_MARKER &&
            (e as HistoryEntry).patches.some(
              (p) => p.path.join("/") === patch.path.join("/"),
            ),
        ) as HistoryEntry | undefined;

        if (entry) {
          (this[collection] as Collections[typeof collection]) = applyPatches(
            this[collection] as Collections[typeof collection],
            entry.inversePatches,
          ) as Collections[typeof collection];
        }
      }
    }
  }

  // Merge server-returned patches without touching undo history
  #mergeServerResponse(collection: CollectionName, patches: Patch[]): void {
    const col = this[collection] as Record<string, Record<string, unknown>>;

    for (const patch of patches) {
      const [id, field] = patch.path as [string, string?];
      if (!field) continue; // skip whole-object patches
      if (!col[id]) continue;

      col[id] = { ...col[id], [field]: patch.value };
    }
  }

  // Apply a remote patch broadcast from another user or OPC-UA
  // No history entry — remote changes are not undoable by this client
  applyRemotePatches(collection: CollectionName, patches: Patch[]): void {
    const col = this[collection] as Record<string, Record<string, unknown>>;

    for (const patch of patches) {
      const [id, field] = patch.path as [string, string?];

      if (patch.op === "remove" && !field) {
        delete col[id];
      } else if (patch.op === "add" && !field) {
        col[id] = patch.value as Record<string, unknown>;
      } else if (field) {
        if (!col[id]) col[id] = {};
        if (patch.op === "remove") {
          delete col[id][field];
        } else {
          col[id] = { ...col[id], [field]: patch.value };
        }
      }
    }
  }

  // --- Undo / Redo ---

  async undo(collection: CollectionName): Promise<void> {
    const stack = this.#history[collection];
    const entry = stack.past.pop();
    if (!entry) return;

    if (entry === SAVE_MARKER) {
      stack.future.push(SAVE_MARKER);
      return this.undo(collection);
    }

    stack.future.push(entry);
    (this[collection] as Collections[typeof collection]) = applyPatches(
      this[collection] as Collections[typeof collection],
      (entry as HistoryEntry).inversePatches,
    ) as Collections[typeof collection];

    // Send inverse patches to server immediately — no debounce on undo
    const squashed = squashPatches((entry as HistoryEntry).inversePatches);
    try {
      await applyMutation({ collection, patches: squashed });
      this.syncError = null;
    } catch (err) {
      this.syncError = `Undo sync failed: ${(err as Error).message}`;
    }
  }

  async redo(collection: CollectionName): Promise<void> {
    const stack = this.#history[collection];
    const entry = stack.future.pop();
    if (!entry) return;

    if (entry === SAVE_MARKER) {
      stack.past.push(SAVE_MARKER);
      return this.redo(collection);
    }

    stack.past.push(entry);
    (this[collection] as Collections[typeof collection]) = applyPatches(
      this[collection] as Collections[typeof collection],
      (entry as HistoryEntry).patches,
    ) as Collections[typeof collection];

    const squashed = squashPatches((entry as HistoryEntry).patches);
    try {
      await applyMutation({ collection, patches: squashed });
      this.syncError = null;
    } catch (err) {
      this.syncError = `Redo sync failed: ${(err as Error).message}`;
    }
  }

  // --- Derived state ---

  get canUndo(): boolean {
    return Object.values(this.#history).some((s) =>
      s.past.some((e) => e !== SAVE_MARKER),
    );
  }

  get canRedo(): boolean {
    return Object.values(this.#history).some((s) =>
      s.future.some((e) => e !== SAVE_MARKER),
    );
  }
}
