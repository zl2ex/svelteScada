import type { EditorState } from "./editorState.svelte";

/**
 * Checks whether an event target is an editable field.
 * @param target - Event target to test.
 * @returns True when the target accepts text input.
 */
export function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable || target.closest("input, textarea, select, [role='textbox']") !== null
  );
}

/**
 * Handles editor keyboard shortcuts for preview and selection.
 * @param editor - Editor state to mutate.
 * @param event - Keyboard event to handle.
 */
export function handleEditorKeyup(editor: EditorState, event: KeyboardEvent) {
  if (isEditableTarget(event.target)) return;

  if (editor.mode === "preview") {
    if (event.key === "Escape") editor.mode = "edit";
    return;
  }

  if (event.key === "Escape") {
    if (editor.selectedElementIds.length > 0) {
      editor.clearElementSelection();
      return;
    }
    editor.setActivePage(null);
    return;
  }

  if (event.key === "Delete" && editor.selectedElementIds.length > 0) {
    event.preventDefault();
    editor.removeSelectedElements();
  }
}
