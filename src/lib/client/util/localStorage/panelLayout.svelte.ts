import { browser } from "$app/environment";
import { err, ok } from "neverthrow";
import { attempt } from "$lib/util/attempt";
import { errorToString, type NeverThrowError } from "$lib/util/neverThrow";

const PANEL_LAYOUT_KEY = "panel:layout";

export type PanelLayoutStorage = {
  left: number | undefined;
  right: number | undefined;
};

export class PanelLayout {
  dragging = $state({ left: false, right: false });
  width: PanelLayoutStorage = $state({ left: undefined, right: undefined });
  /**
   * Creates a panel layout store with no persisted widths yet.
   */
  constructor() {}

  /**
   * Loads panel widths from localStorage and installs resize listeners.
   *
   * No-op in non-browser environments.
   *
   * @returns Ok with the loaded layout, or Err when loading, parsing, or
   * listener setup fails
   */
  loadFromLocalStorage() {
    if (!browser) return ok(this.width);

    const stored = attempt(() => {
      let stored = localStorage.getItem(PANEL_LAYOUT_KEY);
      if (!stored) {
        stored = JSON.stringify(this.width);
        localStorage.setItem(PANEL_LAYOUT_KEY, stored);
      }
      return stored;
    });
    if (stored.isErr) {
      return err({
        reason: "PANEL_LAYOUT_LOAD_FAILED",
        cause: errorToString(stored.error),
      } as const satisfies NeverThrowError);
    }

    const parsed = attempt(() => JSON.parse(stored.data) as PanelLayoutStorage);
    if (parsed.isErr) {
      return err({
        reason: "PANEL_LAYOUT_PARSE_FAILED",
        cause: errorToString(parsed.error),
      } as const satisfies NeverThrowError);
    }
    this.width = parsed.data;

    /**
     * Clears both resize flags and persists the current widths.
     */
    const stopResize = () => {
      if (this.dragging.left) this.dragging.left = false;
      if (this.dragging.right) this.dragging.right = false;
      this.setWidth();
    };

    const listened = attempt(() => {
      document.addEventListener("pointermove", (ev) => {
        if (this.dragging.left) {
          let xPos = ev.clientX;
          if (xPos < 0) xPos = 0;
          if (xPos > window.innerWidth) xPos = window.innerWidth;
          this.width.left = xPos;
        }
        if (this.dragging.right) {
          let xPos = window.innerWidth - ev.clientX;
          if (xPos < 0) xPos = 0;
          if (xPos > window.innerWidth) xPos = window.innerWidth;
          this.width.right = xPos;
        }
      });

      document.addEventListener("pointerup", stopResize);
      document.addEventListener("pointercancel", stopResize);
    });
    if (listened.isErr) {
      return err({
        reason: "PANEL_LAYOUT_LISTENER_FAILED",
        cause: errorToString(listened.error),
      } as const satisfies NeverThrowError);
    }

    return ok(this.width);
  }

  /**
   * Persists panel widths to localStorage.
   *
   * @param [layout] - layout to save (defaults to the current widths)
   * @returns Ok when saved, or Err when the write fails
   */
  setWidth(layout?: PanelLayoutStorage) {
    if (!browser) return ok(undefined);

    const saved = attempt(() =>
      localStorage.setItem(PANEL_LAYOUT_KEY, JSON.stringify(layout ?? this.width)),
    );
    if (saved.isErr) {
      return err({
        reason: "PANEL_LAYOUT_SAVE_FAILED",
        cause: errorToString(saved.error),
      } as const satisfies NeverThrowError);
    }

    return ok(undefined);
  }
}
