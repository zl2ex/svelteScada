import type { Attachment } from "svelte/attachments";
import { dev } from "$app/environment";

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export type CommitOrRevertOptions = {
  /** Commit when the field loses focus without an explicit Enter. Defaults to true. */
  commitOnBlur?: boolean;
  /** Allow Enter to submit the surrounding form instead of blurring/committing. */
  allowNativeEnter?: boolean;
  /** Commit even when the field value did not change. Useful for rename/edit modes. */
  commitOnUnchanged?: boolean;
};

type CommitResult = void | boolean | Promise<void | boolean>;

const readers = {
  string: (el: Field): string => el.value,
  number: (el: Field): number | null => {
    if (el.value.trim() === "") return null; // Number('') would give 0
    const n = Number(el.value);
    return Number.isNaN(n) ? null : n;
  },
};

const isToggle = (el: Field) =>
  el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio");

/**
 * Commits a field value on Enter or blur, and restores the original value on Escape.
 *
 * `onCommit` may return `false` (or resolve to `false`) to request a revert. `onCancel`
 * runs after an Escape-triggered revert, which is useful for cancelling rename/edit modes.
 */
export function commitOrRevert(
  onCommit: (value: string) => CommitResult,
  kind?: "string",
  onCancel?: () => void,
  options?: CommitOrRevertOptions,
): Attachment<Field>;
export function commitOrRevert(
  onCommit: (value: number | null) => CommitResult,
  kind: "number",
  onCancel?: () => void,
  options?: CommitOrRevertOptions,
): Attachment<Field>;
export function commitOrRevert(
  onCommit: ((value: string) => CommitResult) | ((value: number | null) => CommitResult),
  kind: "string" | "number" = "string",
  onCancel?: () => void,
  options: CommitOrRevertOptions = {},
): Attachment<Field> {
  return (el) => {
    if (isToggle(el)) {
      if (dev) console.warn("commitOrRevert does not support checkbox/radio inputs", el);
      return;
    }

    const restoreEvent = el instanceof HTMLSelectElement ? "change" : "input";
    const commitOnBlur = options.commitOnBlur ?? true;
    let cancelled = false;
    let enterCommit = false;
    let original = el.value;

    function restore() {
      el.value = original;
      el.dispatchEvent(new Event(restoreEvent, { bubbles: true })); // for svelte bind:value
    }

    function onFocus() {
      cancelled = false;
      enterCommit = false;
      original = el.value;
    }

    function onKeydown(e: KeyboardEvent) {
      if (e.isComposing) return;

      if (e.key === "Enter") {
        if (options.allowNativeEnter) return;
        e.preventDefault();
        enterCommit = true;
        el.blur();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelled = true;
        el.blur();
      }
    }

    async function onBlur() {
      if (cancelled) {
        cancelled = false;
        enterCommit = false;
        restore();
        onCancel?.();
        return;
      }

      if (!commitOnBlur && !enterCommit) return;
      enterCommit = false;
      if (el.value === original && !options.commitOnUnchanged) return;

      const value = kind === "number" ? readers.number(el) : readers.string(el);
      const result = await (onCommit as (v: string | number | null) => CommitResult)(value);
      if (result === false) restore();
    }

    el.addEventListener("focus", onFocus);
    el.addEventListener("keydown", onKeydown as EventListener);
    el.addEventListener("blur", onBlur);

    return () => {
      el.removeEventListener("focus", onFocus);
      el.removeEventListener("keydown", onKeydown as EventListener);
      el.removeEventListener("blur", onBlur);
    };
  };
}
