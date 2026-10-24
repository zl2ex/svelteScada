import type { EditorState } from "./editorState.svelte";

export function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable || target.closest("input, textarea, select, [role='textbox']") !== null
  );
}

export function handleEditorKeydown(editor: EditorState, event: KeyboardEvent) {
  if (isEditableTarget(event.target)) return;

  if (editor.mode === "preview") {
    if (event.key === "Escape") editor.mode = "edit";
    return;
  }

  if (event.key === "Escape") {
    if (editor.selectedElementId) {
      editor.selectedElementId = null;
      return;
    }
    editor.setActivePage(null);
    return;
  }

  if (event.key === "Delete" && editor.selectedElementId) {
    event.preventDefault();
    editor.removeElement(editor.selectedElementId);
  }
}
