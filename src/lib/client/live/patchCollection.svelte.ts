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
}

export class PatchCollection<T extends Identifiable> {
  state = $state<Record<string, T>>({});

  #travels: Travels<Record<string, T>>;
  #prevPosition: number;
  #applyPatch: PatchCollectionOptions<T>["applyPatch"];
  #unsubscribeTravels?: () => void;
  #unsubscribePatches?: () => void;

  constructor(options: PatchCollectionOptions<T>) {
    Object.assign(this.state, options.initial);

    this.#travels = createTravels(this.state, {
      mutable: true,
      maxHistory: options.maxHistory ?? 50,
    });
    this.#prevPosition = this.#travels.getPosition();
    this.#applyPatch = options.applyPatch;

    // NOTE: assumes travels.subscribe() returns an unsubscribe function
    // (common convention) — verify against the actual return type before
    // relying on #unsubscribeTravels in destroy().
    this.#unsubscribeTravels = this.#travels.subscribe(
      (_state, patches, position) => {
        if (position === this.#prevPosition) {
          this.#prevPosition = position;
          return;
        }

        if (position > this.#prevPosition) {
          this.#sendOps(
            patches.patches[this.#prevPosition],
            patches.inversePatches[this.#prevPosition],
          );
        } else {
          this.#sendOps(
            patches.inversePatches[position],
            patches.patches[position],
          );
        }

        this.#prevPosition = position;
      },
    );

    this.#unsubscribePatches = options.subscribePatches((payload) => {
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

  #sendOps(ops: Ops, inverseOps: Ops) {
    this.#applyPatch(ops).catch(() => {
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
    this.#travels.setState(fn, label ? { label } : undefined);
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
      Object.assign(draft[id], changes);
    }, `Edit ${id}`);
  }

  remove(id: string) {
    this.mutateStateWithHistory((draft) => {
      delete draft[id];
    }, `Delete ${id}`);
  }

  undo() {
    this.#travels.back();
  }

  redo() {
    this.#travels.forward();
  }

  canUndo() {
    return this.#travels.canBack();
  }

  canRedo() {
    return this.#travels.canForward();
  }

  // Call this from onDestroy (or wherever the owning component/page
  // tears down) if this collection's lifetime is scoped to something
  // shorter than the whole app — e.g. a per-document instance closed
  // when a tab closes. Module-level singletons (like a global tags
  // collection) generally never need to call this.
  destroy() {
    this.#unsubscribeTravels?.();
    this.#unsubscribePatches?.();
  }
}
