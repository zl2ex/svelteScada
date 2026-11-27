// patch-collection.svelte.ts
//
// Generic reusable wrapper for the "id-keyed collection with Travels
// undo/redo + patch-based server sync" pattern. Instantiate one per
// collection (tags, canvas document elements, devices, ...).

import { createTravels, type Travels, type TravelPatches } from "travels";
import { apply } from "mutative";
import { toast } from "../toast.svelte";
import { RpcError } from "svelte-realtime/client";
import {
  errorToString,
  neverThrowErrorToString,
  type NeverThrowError,
  type WireResult,
} from "$lib/util/neverThrow";
import { attempt } from "$lib/util/attempt";

export interface Identifiable {
  id: string;
}

type Ops = TravelPatches["patches"][number];

export type PatchOp = TravelPatches["patches"][number][number];
export interface PatchPayload {
  patches: Ops;
  versions?: Record<string, number>;
}

export interface PatchCollectionOptions<T extends Identifiable, E extends NeverThrowError> {
  initial: Record<string, T>;
  // however your generated RPC/room action is shaped, as long as it
  // takes a single patch op and returns/rejects a promise
  applyPatch: (patch: PatchOp) => Promise<WireResult<{ ok: true }, E>>;
  // adapt whatever store you're using (a live.stream, on(topic), etc.)
  // to this shape: call `notify` with each incoming payload, return an
  // unsubscribe function so destroy() can clean up.
  subscribePatches: (notify: (payload: PatchPayload | null) => void) => () => void;
  maxHistory?: number;
  // Called after every tracked mutation (add/update/remove/mutateState).
  // Used by UnifiedUndoManager to record entries on the unified timeline.
  onMutation?: () => void;
  // Called when a server sync fails for one or more patches.
  onError?: (error: NeverThrowError) => void;
  // Called after the server accepts a patch.
  onApplied?: (ops: Ops) => void;
}

export class PatchCollection<T extends Identifiable, E extends NeverThrowError> {
  state = $state<Record<string, T>>({});
  syncError = $state<string | NeverThrowError | null>(null);

  #travels!: Travels<Record<string, T>>;
  #prevPosition = 0;
  #applyPatch: PatchCollectionOptions<T, E>["applyPatch"];
  #onMutation?: () => void;
  #onError?: (error: E) => void;
  #onApplied?: (ops: Ops) => void;
  #unsubscribeTravels?: () => void;
  #unsubscribePatches?: () => void;

  /**
   * Creates a patch-synced collection, wiring Travels history and remote patches.
   *
   * @param options - initial state, patch transport, and lifecycle callbacks
   */
  constructor(options: PatchCollectionOptions<T, E>) {
    Object.assign(this.state, options.initial);

    this.#applyPatch = options.applyPatch;
    this.#onMutation = options.onMutation;
    this.#onError = options.onError;
    this.#onApplied = options.onApplied;

    const created = attempt(() =>
      createTravels(this.state, {
        mutable: true,
        maxHistory: options.maxHistory ?? 50,
      }),
    );
    if (created.isErr) {
      this.syncError = {
        reason: "TRAVELS_CREATE_FAILED",
        cause: errorToString(created.error),
      } as const satisfies NeverThrowError;
      return;
    }
    this.#travels = created.data;
    this.#prevPosition = this.#travels.getPosition();

    this.#unsubscribeTravels = this.#travels.subscribe((event) => {
      const patches = this.#travels.getPatches();

      if (event.position > this.#prevPosition) {
        // foward
        this.#dispatchOps(
          patches.patches[this.#prevPosition],
          patches.inversePatches[this.#prevPosition],
        );
      } else if (event.position == this.#prevPosition) {
        // full histroy buffer
        this.#dispatchOps(
          patches.patches[this.#prevPosition - 1],
          patches.inversePatches[this.#prevPosition - 1],
        );
      } else {
        // reverse
        this.#dispatchOps(patches.inversePatches[event.position], patches.patches[event.position]);
      }

      this.#prevPosition = event.position;
    });

    this.#unsubscribePatches = options.subscribePatches((payload) => {
      if (!payload) return;
      this.mutateStateWithoutHistory((state) => {
        const merged = attempt(() => apply(state, payload.patches, { mutable: true }));
        if (merged.isErr) {
          this.syncError = {
            reason: "PATCH_MERGE_FAILED",
            cause: errorToString(merged.error),
          } as const satisfies NeverThrowError;
          return;
        }
        for (const [id, updatedAt] of Object.entries(payload.versions ?? {})) {
          const item = state[id] as (T & { updatedAt?: number }) | undefined;
          if (item) item.updatedAt = updatedAt;
        }
      });
    });
  }

  // Travels notifies synchronously from inside a mutation, so the sends
  // cannot be awaited there - capture their outcome instead of letting a
  // rejection escape unhandled.
  /**
   * Sends a forward patch batch without awaiting, recording failures on `syncError`.
   *
   * @param ops - forward patch operations
   * @param inverseOps - inverse operations used to revert on failure
   */
  #dispatchOps(ops: Ops, inverseOps: Ops) {
    attempt(() => this.#sendOps(ops, inverseOps)).then((sent) => {
      if (sent.isErr) {
        this.syncError = {
          reason: "PATCH_SEND_FAILED",
          cause: errorToString(sent.error),
        } as const satisfies NeverThrowError;
      }
    });
  }

  /**
   * Reverts the single inverse operation at the given index.
   *
   * @param inverseOps - inverse patch operations
   * @param index - index of the operation to apply
   */
  #revertOps(inverseOps: Ops, index: number) {
    const reverted = attempt(() =>
      apply(this.state, inverseOps.slice(index, index + 1), { mutable: true }),
    );
    if (reverted.isErr) {
      this.syncError = {
        reason: "PATCH_REVERT_FAILED",
        cause: errorToString(reverted.error),
      } as const satisfies NeverThrowError;
    }
  }

  /**
   * Sends each forward patch in order, reverting and reporting any that fail.
   *
   * @param ops - forward patch operations
   * @param inverseOps - inverse operations used to revert failures
   */
  async #sendOps(ops: Ops, inverseOps: Ops) {
    let hadError = false;
    for (let i = 0; i < ops.length; i++) {
      const sent = await attempt(() => this.#applyPatch(ops[i]));

      if (sent.isErr) {
        hadError = true;
        this.#revertOps(inverseOps, i);
        this.syncError = {
          reason: "PATCH_SEND_FAILED",
          cause: errorToString(sent.error),
        } as const satisfies NeverThrowError;
        toast({
          kind: "error",
          title: "Sync Error",
          description: neverThrowErrorToString(this.syncError),
          duration: 3000,
        });
        continue;
      }

      const res = sent.data;
      if (res.isErr) {
        // The server rejected this op but will still receive the rest of the
        // batch, so revert only the failing op locally and keep going —
        // later ops are still sent and applied.
        hadError = true;
        this.#revertOps(inverseOps, i);

        if (res.error instanceof RpcError) {
          this.syncError = res.error.code;
        } else {
          this.syncError = res.error;
        }
        toast({
          kind: "error",
          title: "Sync Error",
          description: neverThrowErrorToString(this.syncError),
          duration: 3000,
        });
        this.#onError?.(res.error);
      } else {
        const applied = attempt(() => this.#onApplied?.([ops[i]] as Ops));
        if (applied.isErr) {
          console.error("PatchCollection onApplied callback failed:", applied.error);
        }
      }
    }
    if (!hadError) this.syncError = null;
  }

  // Generic escape hatch: tracked mutation, goes through Travels exactly
  // like add/update/remove — generates a patch, gets a history entry, gets
  // sent to the server via the subscribe listener. Use this for any
  // compound edit that doesn't fit the three named methods (e.g. mutating
  // several fields across several ids in one undoable step).
  /**
   * Applies a tracked mutation through Travels, producing history and a server patch.
   *
   * @param fn - recipe mutating the draft collection
   * @param [label] - optional label for the history entry
   */
  mutateState(fn: (draft: Record<string, T>) => void, label?: string) {
    const tracked = attempt(() => this.#travels.setState(fn as any, label ? { label } : undefined));
    if (tracked.isErr) {
      this.syncError = {
        reason: "TRAVELS_SET_STATE_FAILED",
        cause: errorToString(tracked.error),
      } as const satisfies NeverThrowError;
      return;
    }
    this.#onMutation?.();
  }

  // Generic escape hatch: UNTRACKED mutation. Bypasses Travels entirely —
  // no patch generated, no history entry, nothing sent to the server. This
  // is the same mechanism the remote-patch merge uses internally, exposed
  // for other cases that genuinely shouldn't be undoable or synced (e.g. a
  // local-only `selected`/`hovered` UI flag on an item). Because `state` is
  // already a live reactive object, `fn` can mutate it directly — no
  // Mutative recipe/draft finalization needed for the untracked path.
  /**
   * Applies an untracked mutation directly to state, bypassing history and sync.
   *
   * @param fn - callback receiving the live state object
   */
  mutateStateWithoutHistory(fn: (state: Record<string, T>) => void) {
    fn(this.state);
  }

  /**
   * Adds an item as a tracked, syncable mutation.
   *
   * @param item - item to add
   */
  add(item: T) {
    this.mutateState((draft) => {
      draft[item.id] = item;
    }, `Add ${item.id}`);
  }

  /**
   * Updates an item as a tracked, syncable mutation, sending the full object.
   *
   * @param id - id of the item to update
   * @param changes - fields to merge into the item
   */
  update(id: string, changes: Partial<Omit<T, "id">>) {
    this.mutateState((draft) => {
      // always send the entire object to the server for flat ["id"] = {entire object}
      // consistency so no properties are missing
      draft[id] = { ...draft[id], ...changes };
    }, `Edit ${id}`);
  }

  /**
   * Removes an item as a tracked, syncable mutation.
   *
   * @param id - id of the item to remove
   */
  remove(id: string) {
    this.mutateState((draft) => {
      delete draft[id];
    }, `Delete ${id}`);
  }

  /**
   * Adds multiple items as one tracked, syncable mutation.
   *
   * @param items - items to add
   */
  addMany(items: T[]) {
    this.mutateState(
      (draft) => {
        items.forEach((item) => (draft[item.id] = item));
      },
      `Add ${items.forEach((item) => item.id)}`,
    );
  }

  /**
   * Updates multiple items as one tracked, syncable mutation.
   *
   * @param items - id and changes pairs to merge
   */
  updateMany(items: { id: string; changes: Partial<Omit<T, "id">> }[]) {
    this.mutateState(
      (draft) => {
        // always send the entire object to the server for flat ["id"] = {entire object}
        // consistency so no properties are missing
        items.forEach((item) => (draft[item.id] = { ...draft[item.id], ...item.changes }));
      },
      `Edit ${items.forEach((item) => item.id)}`,
    );
  }

  /**
   * Removes multiple items as one tracked, syncable mutation.
   *
   * @param ids - ids of the items to remove
   */
  removeMany(ids: string[]) {
    this.mutateState((draft) => {
      ids.forEach((id) => delete draft[id]);
    }, `Delete ${ids}`);
  }

  /**
   * Steps the collection back one history position.
   */
  undo() {
    const undone = attempt(() => this.#travels.back());
    if (undone.isErr) {
      this.syncError = {
        reason: "TRAVELS_BACK_FAILED",
        cause: errorToString(undone.error),
      } as const satisfies NeverThrowError;
    }
  }

  /**
   * Steps the collection forward one history position.
   */
  redo() {
    const redone = attempt(() => this.#travels.forward());
    if (redone.isErr) {
      this.syncError = {
        reason: "TRAVELS_FORWARD_FAILED",
        cause: errorToString(redone.error),
      } as const satisfies NeverThrowError;
    }
  }

  /**
   * Returns whether the collection can undo.
   *
   * @returns true when a previous history position exists
   */
  canUndo() {
    return this.#travels.canBack();
  }

  /**
   * Returns whether the collection can redo.
   *
   * @returns true when a forward history position exists
   */
  canRedo() {
    return this.#travels.canForward();
  }

  /**
   * Disposes the collection when used with a `using` declaration.
   */
  [Symbol.dispose]() {
    this.dispose();
  }
  /**
   * Unsubscribes from Travels and remote patches.
   */
  dispose() {
    this.#unsubscribeTravels?.();
    this.#unsubscribePatches?.();
  }
}
