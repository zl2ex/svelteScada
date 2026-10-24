import { getContext, setContext } from "svelte";
import type { EditorState } from "./editorState.svelte";

const editorKey = Symbol("page-editor");

export function setEditorContext(state: EditorState) {
  setContext(editorKey, state);
}

export function getEditorContext() {
  const state = getContext<EditorState | undefined>(editorKey);
  if (!state) throw Error("getEditorContext() called before setEditorContext()");
  return state;
}
