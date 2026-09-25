// unified-undo-manager.svelte.ts
//
// Layer on top of PatchCollection that provides context-aware undo/redo.
//
// Contexts group collections that undo together (e.g. tags + folders
// are both in the "project" context and undo in chronological order).
//
// Context types control priority:
//   - "project"  – default bucket; everything in it undoes in order.
//   - "document" – tied to an editor canvas / SVG drawing. When a
//     document context is active, its undo is tried first; once its
//     history is exhausted the manager falls through to the next
//     context type in the undo stack.

import type { PatchCollection } from "./patchCollection.svelte";

// ── types ────────────────────────────────────────────────

export type ContextType = "project" | "document";

type ContextEntry = {
  collection: PatchCollection<any, any>;
  contextType: ContextType;
};

type UndoRedoRecord = {
  // One timeline entry may cover several contexts — e.g. a transaction
  // that touched both the tags and folders collections. Undo/redo then
  // plays back every collection in the record.
  contexts: string[];
  // How many history steps each context moved while this entry was being
  // recorded. A transaction that calls add() in a loop advances a single
  // collection's Travels by N positions, so undoing it must step back N
  // times, not once. Falls back to 1 for single-mutation entries.
  steps: Record<string, number>;
  timestamp: number;
};

// ── class ────────────────────────────────────────────────

export class UnifiedUndoManager {
  private contexts = new Map<string, ContextEntry>();
  private undoTimeline: UndoRedoRecord[] = [];
  private redoTimeline: UndoRedoRecord[] = [];
  private activeDocument: string | null = null;

  // Transaction support
  private transactionStack = 0; // >0 when inside a begin/end pair
  private transactionBuffer = new Map<string, number>(); // contexts -> # of mutations

  // ── registration ─────────────────────────────────────

  register(
    name: string,
    collection: PatchCollection<any, any>,
    contextType: ContextType = "project",
  ) {
    this.contexts.set(name, { collection, contextType });
  }

  unregister(name: string) {
    this.contexts.delete(name);
  }

  // ── active document ──────────────────────────────────

  setActiveDocument(name: string | null) {
    this.activeDocument = name;
  }

  getActiveDocument(): string | null {
    return this.activeDocument;
  }

  // ── timeline bookkeeping ─────────────────────────────

  /**
   * Record a forward mutation on the unified timeline.
   * PatchCollection's onMutation callback calls this automatically
   * after every add / update / remove / mutateStateWithHistory.
   *
   * Batch operations (e.g. delete 5 nodes in a loop) should call
   * `recordMutation` once after the batch, not once per item.
   * Use `batchBegin` / `batchEnd` or call `recordMutation` manually
   * with `onMutation` disabled for that purpose.
   */
  recordMutation(context: string) {
    // During a transaction, count the mutations per context instead of
    // adding to the timeline. A batch op (e.g. pasting N folders) advances
    // the collection's Travels by N positions, so the entry must remember
    // N so undo/redo can step that far back/forward.
    if (this.transactionStack > 0) {
      this.transactionBuffer.set(
        context,
        (this.transactionBuffer.get(context) ?? 0) + 1,
      );
      return;
    }

    this.undoTimeline.push({
      contexts: [context],
      steps: { [context]: 1 },
      timestamp: Date.now(),
    });
    // A new mutation clears the redo stack
    this.redoTimeline.length = 0;
  }

  // ── transaction support ─────────────────────────────────

  /**
   * Start a transaction. All mutations recorded via `recordMutation`
   * until `endTransaction()` is called are grouped into a single
   * undo/redo action on the unified timeline.
   *
   * Calls can be nested — only the outermost `endTransaction` flushes.
   */
  beginTransaction() {
    this.transactionStack++;
  }

  /**
   * End a transaction. The buffered mutations are committed to the
   * unified timeline as a single entry covering every context that
   * was touched (so a transaction spanning multiple collections
   * undoes/redoes as one action).
   */
  endTransaction() {
    if (this.transactionStack === 0) {
      console.warn(
        "UnifiedUndoManager.endTransaction() called without a matching beginTransaction()",
      );
      return;
    }

    this.transactionStack--;

    if (this.transactionStack > 0) return; // still inside a nested transaction

    // Flush the buffer — one timeline entry for the whole transaction,
    // regardless of how many distinct contexts were mutated.
    if (this.transactionBuffer.size > 0) {
      this.undoTimeline.push({
        contexts: [...this.transactionBuffer.keys()],
        steps: Object.fromEntries(this.transactionBuffer),
        timestamp: Date.now(),
      });
    }
    this.redoTimeline.length = 0;
    this.transactionBuffer.clear();
  }

  /**
   * Record that a collection just undid or redid a step.
   * Called internally by `undo()` / `redo()` — not meant for external use.
   */
  private recordMove(direction: "undo" | "redo", entry: UndoRedoRecord) {
    const timestamp = Date.now();

    if (direction === "undo") {
      const index = this.undoTimeline.indexOf(entry);
      if (index >= 0) this.undoTimeline.splice(index, 1);
      this.redoTimeline.push({ ...entry, timestamp });
    } else {
      const index = this.redoTimeline.indexOf(entry);
      if (index >= 0) this.redoTimeline.splice(index, 1);
      this.undoTimeline.push({ ...entry, timestamp });
    }
  }

  // ── undo / redo ──────────────────────────────────────

  /**
   * Undo the most recent mutation.
   *
   * Priority:
   * 1. If an active document context has entries on the timeline, undo
   *    from it first.
   * 2. Otherwise undo from whatever context is on top of the timeline
   *    (most-recent-first, regardless of type).
   *
   * A single timeline entry may span several contexts; undoing it plays
   * back each collection in reverse order.
   */
  undo() {
    const entry = this.peekUndoTimeline();
    if (!entry) return;

    this.recordMove("undo", entry);

    // Undo in reverse of the order the contexts were mutated, stepping each
    // collection back by the number of positions it advanced for this entry.
    for (const context of [...entry.contexts].reverse()) {
      const ctx = this.contexts.get(context);
      if (!ctx) continue;
      const steps = entry.steps[context] ?? 1;
      for (let i = 0; i < steps; i++) ctx.collection.undo();
    }
  }

  /**
   * Redo the most recently undone mutation.
   */
  redo() {
    const entry = this.peekRedoTimeline();
    if (!entry) return;

    this.recordMove("redo", entry);

    // Redo in the original mutation order, stepping each collection forward
    // by the number of positions it moved for this entry.
    for (const context of entry.contexts) {
      const ctx = this.contexts.get(context);
      if (!ctx) continue;
      const steps = entry.steps[context] ?? 1;
      for (let i = 0; i < steps; i++) ctx.collection.redo();
    }
  }

  /**
   * Walk the timeline from the end looking for the best entry to undo.
   */
  private peekUndoTimeline(): UndoRedoRecord | undefined {
    if (this.undoTimeline.length === 0) return undefined;

    // If there is an active document, prefer undoing from it first
    if (this.activeDocument) {
      for (let i = this.undoTimeline.length - 1; i >= 0; i--) {
        const entry = this.undoTimeline[i];
        if (entry.contexts.includes(this.activeDocument)) {
          const ctx = this.contexts.get(this.activeDocument);
          if (ctx && ctx.contextType === "document") return entry;
        }
      }
    }

    // Fall through to the most recent entry regardless of context type
    return this.undoTimeline[this.undoTimeline.length - 1];
  }

  private peekRedoTimeline(): UndoRedoRecord | undefined {
    if (this.redoTimeline.length === 0) return undefined;

    // Mirror of peekTimeline: prefer redoing the active document first
    if (this.activeDocument) {
      for (let i = this.redoTimeline.length - 1; i >= 0; i--) {
        const entry = this.redoTimeline[i];
        if (entry.contexts.includes(this.activeDocument)) {
          const ctx = this.contexts.get(this.activeDocument);
          if (ctx && ctx.contextType === "document") return entry;
        }
      }
    }

    return this.redoTimeline[this.redoTimeline.length - 1];
  }

  // ── query helpers ────────────────────────────────────

  canUndo(): boolean {
    return this.peekUndoTimeline() !== undefined;
  }

  canRedo(): boolean {
    return this.peekRedoTimeline() !== undefined;
  }

  /** Snapshot of the unified timeline (newest last). */
  getTimeline(): readonly UndoRedoRecord[] {
    return this.undoTimeline;
  }

  /** Snapshot of the redo stack (newest last). */
  getRedoTimeline(): readonly UndoRedoRecord[] {
    return this.redoTimeline;
  }
}
