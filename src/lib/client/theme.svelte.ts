import { browser } from "$app/environment";
import { err, ok } from "neverthrow";
import { attempt } from "$lib/util/attempt";
import { errorToString, type NeverThrowError } from "$lib/util/neverThrow";

export type Theme = (typeof themeManager.themes)[number];
export class ThemeManager {
  themes = ["system", "light", "dark"] as const;
  theme: Theme = $state("system");
  constructor() {}

  loadTheme() {
    if (!browser) return ok(this.theme);

    // On load, restore saved preference for light or dark theme
    const stored = attempt(() => localStorage.getItem("theme"));
    if (stored.error) {
      return err({
        reason: "THEME_LOAD_FAILED",
        cause: errorToString(stored.error),
      } as const satisfies NeverThrowError);
    }

    const localStorageTheme = (stored.data as Theme | null) ?? "system";
    return this.setTheme(localStorageTheme);
  }

  setTheme(newTheme: Theme) {
    this.theme = newTheme;

    const applied = attempt(() => {
      if (newTheme === "system") {
        document.documentElement.removeAttribute("color-scheme");
      } else {
        document.documentElement.setAttribute("color-scheme", newTheme);
      }
    });
    if (applied.error) {
      return err({
        reason: "THEME_APPLY_FAILED",
        cause: errorToString(applied.error),
      } as const satisfies NeverThrowError);
    }

    const saved = attempt(() => localStorage.setItem("theme", newTheme));
    if (saved.error) {
      return err({
        reason: "THEME_SAVE_FAILED",
        cause: errorToString(saved.error),
      } as const satisfies NeverThrowError);
    }

    return ok(newTheme);
  }
}

export let themeManager = new ThemeManager();
