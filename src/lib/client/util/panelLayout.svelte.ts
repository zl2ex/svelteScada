import { browser } from "$app/environment";

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
    if (!browser) return;
    try {
      let stored = localStorage.getItem(PANEL_LAYOUT_KEY);
      if (!stored) {
        stored = JSON.stringify(this.width);
        localStorage.setItem(PANEL_LAYOUT_KEY, stored);
      }
      this.width = JSON.parse(stored) as PanelLayoutStorage;
    } catch (e) {
      console.error(e);
    }

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
  }

  setWidth(layout?: PanelLayoutStorage) {
    if (!browser) return;
    localStorage.setItem(
      PANEL_LAYOUT_KEY,
      JSON.stringify(layout ?? this.width),
    );
  }
}
