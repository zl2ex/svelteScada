import { browser } from "$app/environment";

export type Theme = (typeof themeManager.themes)[number];
export class ThemeManager {
  themes = ["system", "light", "dark"] as const;
  theme: Theme = $state("system");
  constructor() {}

  loadTheme() {
    if (browser) {
      // On load, restore saved preference for light or dark theme
      let localStorageTheme: Theme = localStorage.getItem("theme") as Theme;
      if (!localStorageTheme) {
        localStorageTheme = "system";
      }
      this.setTheme(localStorageTheme);
    }
  }

  setTheme(newTheme: Theme) {
    this.theme = newTheme;
    if (newTheme === "system") {
      document.documentElement.removeAttribute("color-scheme");
    } else {
      document.documentElement.setAttribute("color-scheme", newTheme);
    }

    localStorage.setItem("theme", newTheme);
  }
}

export let themeManager = new ThemeManager();
