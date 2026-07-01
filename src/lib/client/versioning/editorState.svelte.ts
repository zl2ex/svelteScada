import { produceWithPatches, applyPatches, enablePatches } from "immer";
import type { Patch } from "immer";
import { applyMutation } from "$live/editor";
import { squashPatches } from "$lib/client/versioning/patches";
import type { Tag, Device, Display } from "$lib/server/sqlite/schema";
import type {
  CollectionName,
  Collections,
  MutationSchema,
} from "../../../live/editor";
import { tryCatch } from "$lib/util/tryCatch";
import type { ClosureTableNode } from "$lib/server/sqlite/tagClosureTable";

enablePatches();

const SAVE_MARKER = Symbol("SAVE_MARKER");

interface HistoryEntry {
  collection: MutationSchema["collection"];
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
  folders = $state<ClosureTableNode[]>([]);
  syncError = $state<string | null>(null);

  // TD WIP DEV $state only for dev
  history: CollectionStack = $state({
    past: [SAVE_MARKER],
    future: [SAVE_MARKER],
  });

  constructor(initial: Collections) {
    this.tags = initial.tags;
    this.folders = initial.folders;
  }

  // --- Mutations ---

  async mutate<K extends CollectionName>(
    collection: K,
    recipe: (draft: Collections[K]) => void,
  ) {
    const current = $state.snapshot(this[collection]) as Collections[K];
    const [next, patches, inversePatches] = produceWithPatches(current, recipe);

    this.history.past.push({
      collection,
      patches,
      inversePatches,
    });

    console.debug(this.history.past);
    this.history.future = [];
    (this[collection] as Collections[K]) = next;

    const squashed = squashPatches(patches);
    // applyMutation is a live.validated remote function —
    // called like a local async function, runs on server via WebSocket
    const result = await applyMutation({ collection, patches: squashed });
  }

  tagDelete(id: string): void {
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

  async undo(): Promise<void> {
    const stack = this.history;
    const entry = stack.past.pop();
    if (!entry) return;

    if (entry === SAVE_MARKER) {
      stack.future.push(SAVE_MARKER);
      return this.undo();
    }

    stack.future.push(entry);
    (this[entry.collection] as Collections[typeof entry.collection]) =
      applyPatches(
        this[entry.collection] as Collections[typeof entry.collection],
        (entry as HistoryEntry).inversePatches,
      ) as Collections[typeof entry.collection];

    // Send inverse patches to server immediately — no debounce on undo
    const squashed = squashPatches((entry as HistoryEntry).inversePatches);
    try {
      await applyMutation({ collection: entry.collection, patches: squashed });
      this.syncError = null;
    } catch (err) {
      this.syncError = `Undo sync failed: ${(err as Error).message}`;
    }
  }

  async redo(): Promise<void> {
    const stack = this.history;
    const entry = stack.future.pop();
    if (!entry) return;

    if (entry === SAVE_MARKER) {
      stack.past.push(SAVE_MARKER);
      return this.redo();
    }

    stack.past.push(entry);
    (this[entry.collection] as Collections[typeof entry.collection]) =
      applyPatches(
        this[entry.collection] as Collections[typeof entry.collection],
        (entry as HistoryEntry).patches,
      ) as Collections[typeof entry.collection];

    const squashed = squashPatches((entry as HistoryEntry).patches);

    const mutation = await tryCatch(applyMutation, {
      collection: entry.collection,
      patches: squashed,
    });
    this.syncError = null;
    if (mutation.error)
      this.syncError = `Redo sync failed: ${mutation.error.message}`;
  }

  // --- Derived state ---

  get canUndo(): boolean {
    return Object.values(this.history).some((s) =>
      s.past.some((e) => e !== SAVE_MARKER),
    );
  }

  get canRedo(): boolean {
    return Object.values(this.history).some((s) =>
      s.future.some((e) => e !== SAVE_MARKER),
    );
  }
}
