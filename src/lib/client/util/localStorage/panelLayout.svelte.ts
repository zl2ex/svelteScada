import { browser } from "$app/environment";
import { err, ok } from "neverthrow";
import { attempt } from "$lib/util/attempt";
import { errorToString, type NeverThrowError } from "$lib/util/neverThrow";

const PANEL_LAYOUT_KEY = "PANEL_LAYOUT";

export type PanelLayoutStorage = {
  left: number | undefined;
  right: number | undefined;
};

export class PanelLayout {
  dragging = $state({ left: false, right: false });
  width: PanelLayoutStorage = $state({ left: undefined, right: undefined });
  constructor() {}

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
    if (stored.error) {
      return err({
        reason: "PANEL_LAYOUT_LOAD_FAILED",
        cause: errorToString(stored.error),
      } as const satisfies NeverThrowError);
    }

    const parsed = attempt(() => JSON.parse(stored.data) as PanelLayoutStorage);
    if (parsed.error) {
      return err({
        reason: "PANEL_LAYOUT_PARSE_FAILED",
        cause: errorToString(parsed.error),
      } as const satisfies NeverThrowError);
    }
    this.width = parsed.data;

    const listened = attempt(() => {
      document.addEventListener("mousemove", (ev) => {
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

      document.addEventListener("mouseup", (ev) => {
        if (this.dragging.left) this.dragging.left = false;
        if (this.dragging.right) this.dragging.right = false;
        this.setWidth();
      });
    });
    if (listened.error) {
      return err({
        reason: "PANEL_LAYOUT_LISTENER_FAILED",
        cause: errorToString(listened.error),
      } as const satisfies NeverThrowError);
    }

    return ok(this.width);
  }

  setWidth(layout?: PanelLayoutStorage) {
    if (!browser) return ok(undefined);

    const saved = attempt(() =>
      localStorage.setItem(
        PANEL_LAYOUT_KEY,
        JSON.stringify(layout ?? this.width),
      ),
    );
    if (saved.error) {
      return err({
        reason: "PANEL_LAYOUT_SAVE_FAILED",
        cause: errorToString(saved.error),
      } as const satisfies NeverThrowError);
    }

    return ok(undefined);
  }
}
