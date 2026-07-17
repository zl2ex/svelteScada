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
  collection: PatchCollection<any>;
  contextType: ContextType;
};

type UndoRedoRecord = {
  context: string;
  timestamp: number;
};

// ── class ────────────────────────────────────────────────

export class UnifiedUndoManager {
  private contexts = new Map<string, ContextEntry>();
  private undoTimeline: UndoRedoRecord[] = [];
  private redoTimeline: UndoRedoRecord[] = [];
  private activeDocument: string | null = null;

  // ── registration ─────────────────────────────────────

  register(
    name: string,
    collection: PatchCollection<any>,
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
    this.undoTimeline.push({ context, timestamp: Date.now() });
    // A new mutation clears the redo stack
    this.redoTimeline.length = 0;
  }

  /**
   * Record that a collection just undid or redid a step.
   * Called internally by `undo()` / `redo()` — not meant for external use.
   */
  private recordMove(direction: "undo" | "redo") {
    const timestamp = Date.now();

    if (direction === "undo") {
      const last = this.undoTimeline.pop();
      if (last) this.redoTimeline.push({ ...last, timestamp });
    } else {
      const last = this.redoTimeline.pop();
      if (last) this.undoTimeline.push({ ...last, timestamp });
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
   */
  undo() {
    const entry = this.peekUndoTimeline();
    if (!entry) return;

    const ctx = this.contexts.get(entry.context);
    if (!ctx) return;

    this.recordMove("undo");
    ctx.collection.undo();
  }

  /**
   * Redo the most recently undone mutation.
   */
  redo() {
    const entry = this.peekRedoTimeline();
    if (!entry) return;

    const ctx = this.contexts.get(entry.context);
    if (!ctx) return;

    this.recordMove("redo");
    ctx.collection.redo();
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
        if (entry.context === this.activeDocument) {
          const ctx = this.contexts.get(entry.context);
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
        if (entry.context === this.activeDocument) {
          const ctx = this.contexts.get(entry.context);
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
