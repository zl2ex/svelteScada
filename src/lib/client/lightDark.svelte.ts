import { browser } from "$app/environment";
import { err, ok } from "neverthrow";
import { attempt } from "$lib/util/attempt";
import { errorToString, type NeverThrowError } from "$lib/util/neverThrow";

const LIGHT_DARK_KEY = "light-dark";

export type LightDark = (typeof lightDarkManager.themes)[number];
export class LightDarkManager {
  themes = ["system", "light", "dark"] as const;
  current: LightDark = $state("system");
  constructor() {}

  loadLightDark() {
    if (!browser) return ok(this.current);

    // On load, restore saved preference for light or dark theme
    const stored = attempt(() => localStorage.getItem(LIGHT_DARK_KEY));
    if (stored.isErr) {
      return err({
        reason: "THEME_LOAD_FAILED",
        cause: errorToString(stored.error),
      } as const satisfies NeverThrowError);
    }

    const localStorageTheme = (stored.data as LightDark | null) ?? "system";
    return this.setLightDark(localStorageTheme);
  }

  setLightDark(newTheme: LightDark) {
    this.current = newTheme;

    const applied = attempt(() => {
      if (newTheme === "system") {
        document.documentElement.removeAttribute("color-scheme");
      } else {
        document.documentElement.setAttribute("color-scheme", newTheme);
      }
    });
    if (applied.isErr) {
      return err({
        reason: "LIGHT_DARK_APPLY_FAILED",
        cause: errorToString(applied.error),
      } as const satisfies NeverThrowError);
    }

    const saved = attempt(() => localStorage.setItem(LIGHT_DARK_KEY, newTheme));
    if (saved.isErr) {
      return err({
        reason: "LIGHT_DARK_SAVE_FAILED",
        cause: errorToString(saved.error),
      } as const satisfies NeverThrowError);
    }

    return ok(newTheme);
  }
}

export let lightDarkManager = new LightDarkManager();
