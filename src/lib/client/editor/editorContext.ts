import { getContext, setContext } from "svelte";
import type { EditorState } from "./editorState.svelte";

const editorKey = Symbol("page-editor");

let editorInstance: EditorState | undefined;

/**
 * Stores the editor state in both module scope and Svelte context.
 * @param state - Editor state to expose.
 */
export function setEditorContext(state: EditorState) {
  editorInstance = state;
  setContext(editorKey, state);
}

/**
 * Returns the editor state from Svelte context.
 * @returns The editor state.
 * @throws {Error} when called before setEditorContext().
 */
export function getEditorContext() {
  const state = getContext<EditorState | undefined>(editorKey);
  if (!state) throw Error("getEditorContext() called before setEditorContext()");
  return state;
}

/**
 * Returns the module-scoped editor instance.
 * @returns The current editor instance, or undefined.
 */
export function getEditorInstance() {
  return editorInstance;
}
