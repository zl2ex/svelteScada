// patch-collection.svelte.ts
//
// Generic reusable wrapper for the "id-keyed collection with Travels
// undo/redo + patch-based server sync" pattern. Instantiate one per
// collection (tags, canvas document elements, devices, ...).

import { createTravels, type Travels, type TravelPatches } from "travels";
import { apply } from "mutative";

export interface Identifiable {
  id: string;
}

type Ops = TravelPatches["patches"][number];

export interface PatchPayload {
  patches: Ops;
  versions?: Record<string, number>;
}

export interface PatchCollectionOptions<T extends Identifiable> {
  initial: Record<string, T>;
  // however your generated RPC/room action is shaped, as long as it
  // takes ops and returns/rejects a promise
  applyPatch: (ops: Ops) => Promise<unknown>;
  // adapt whatever store you're using (a live.stream, on(topic), etc.)
  // to this shape: call `notify` with each incoming payload, return an
  // unsubscribe function so destroy() can clean up.
  subscribePatches: (
    notify: (payload: PatchPayload | null) => void,
  ) => () => void;
  maxHistory?: number;
  // Called after every tracked mutation (add/update/remove/mutateStateWithHistory).
  // Used by UnifiedUndoManager to record entries on the unified timeline.
  onMutation?: () => void;
}

export class PatchCollection<T extends Identifiable> {
  state = $state<Record<string, T>>({});

  private travels: Travels<Record<string, T>>;
  private prevPosition: number;
  private applyPatch: PatchCollectionOptions<T>["applyPatch"];
  private onMutation?: () => void;
  private unsubscribeTravels?: () => void;
  private unsubscribePatches?: () => void;

  constructor(options: PatchCollectionOptions<T>) {
    Object.assign(this.state, options.initial);

    this.travels = createTravels(this.state, {
      mutable: true,
      maxHistory: options.maxHistory ?? 50,
    });
    this.prevPosition = this.travels.getPosition();
    this.applyPatch = options.applyPatch;
    this.onMutation = options.onMutation;

    this.unsubscribeTravels = this.travels.subscribe(
      (_state, patches, position) => {
        if (position === this.prevPosition) {
          this.prevPosition = position;
          return;
        }

        if (position > this.prevPosition) {
          this.sendOps(
            patches.patches[this.prevPosition],
            patches.inversePatches[this.prevPosition],
          );
        } else {
          this.sendOps(
            patches.inversePatches[position],
            patches.patches[position],
          );
        }

        this.prevPosition = position;
      },
    );

    this.unsubscribePatches = options.subscribePatches((payload) => {
      if (!payload) return;
      this.mutateState((state) => {
        apply(state, payload.patches, { mutable: true });
        for (const [id, updatedAt] of Object.entries(payload.versions ?? {})) {
          const item = state[id] as (T & { updatedAt?: number }) | undefined;
          if (item) item.updatedAt = updatedAt;
        }
      });
    });
  }

  private sendOps(ops: Ops, inverseOps: Ops) {
    this.applyPatch(ops).catch(() => {
      apply(this.state, inverseOps, { mutable: true }); // rollback on failure
    });
  }

  // Generic escape hatch: tracked mutation, goes through Travels exactly
  // like add/update/remove — generates a patch, gets a history entry, gets
  // sent to the server via the subscribe listener. Use this for any
  // compound edit that doesn't fit the three named methods (e.g. mutating
  // several fields across several ids in one undoable step).
  mutateStateWithHistory(
    fn: (draft: Record<string, T>) => void,
    label?: string,
  ) {
    this.travels.setState(fn as any, label ? { label } : undefined);
    this.onMutation?.();
  }

  // Generic escape hatch: UNTRACKED mutation. Bypasses Travels entirely —
  // no patch generated, no history entry, nothing sent to the server. This
  // is the same mechanism the remote-patch merge uses internally, exposed
  // for other cases that genuinely shouldn't be undoable or synced (e.g. a
  // local-only `selected`/`hovered` UI flag on an item). Because `state` is
  // already a live reactive object, `fn` can mutate it directly — no
  // Mutative recipe/draft finalization needed for the untracked path.
  mutateState(fn: (state: Record<string, T>) => void) {
    fn(this.state);
  }

  add(item: T) {
    this.mutateStateWithHistory((draft) => {
      draft[item.id] = item;
    }, `Add ${item.id}`);
  }

  update(id: string, changes: Partial<Omit<T, "id">>) {
    this.mutateStateWithHistory((draft) => {
      // always send the entire object to the server for flat ["id"] = {entire object}
      // consistency so no properties are missing
      draft[id] = { ...draft[id], ...changes };
    }, `Edit ${id}`);
  }

  remove(id: string) {
    this.mutateStateWithHistory((draft) => {
      delete draft[id];
    }, `Delete ${id}`);
  }

  addMany(items: T[]) {
    this.mutateStateWithHistory(
      (draft) => {
        items.forEach((item) => (draft[item.id] = item));
      },
      `Add ${items.forEach((item) => item.id)}`,
    );
  }

  updateMany(items: { id: string; changes: Partial<Omit<T, "id">> }[]) {
    this.mutateStateWithHistory(
      (draft) => {
        // always send the entire object to the server for flat ["id"] = {entire object}
        // consistency so no properties are missing
        items.forEach(
          (item) => (draft[item.id] = { ...draft[item.id], ...item.changes }),
        );
      },
      `Edit ${items.forEach((item) => item.id)}`,
    );
  }

  removeMany(ids: string[]) {
    this.mutateStateWithHistory((draft) => {
      ids.forEach((id) => delete draft[id]);
    }, `Delete ${ids}`);
  }

  undo() {
    this.travels.back();
  }

  redo() {
    this.travels.forward();
  }

  canUndo() {
    return this.travels.canBack();
  }

  canRedo() {
    return this.travels.canForward();
  }

  // Call this from onDestroy (or wherever the owning component/page
  // tears down) if this collection's lifetime is scoped to something
  // shorter than the whole app — e.g. a per-document instance closed
  // when a tab closes. Module-level singletons (like a global tags
  // collection) generally never need to call this.
  dispose() {
    this.unsubscribeTravels?.();
    this.unsubscribePatches?.();
  }
}
