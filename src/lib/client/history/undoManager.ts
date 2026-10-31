import { browser } from "$app/env";
import { UnifiedUndoManager } from "../live/undoManager.svelte";

export const undoManager = new UnifiedUndoManager();

if (browser) {
  document.addEventListener("keyup", (e) => {
    if (e.key == "z" && e.ctrlKey) undoManager.undo();
    if (e.key == "y" && e.ctrlKey) undoManager.redo();
  });
}
