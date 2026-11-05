import type { EditorState } from "./editorState.svelte";

export function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable || target.closest("input, textarea, select, [role='textbox']") !== null
  );
}

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
