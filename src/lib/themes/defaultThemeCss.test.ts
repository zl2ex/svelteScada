import { describe, expect, it } from "vitest";
import { DEFAULT_THEME_BODY, LIGHT_DARK_PAIRINGS_CSS } from "./defaultThemeCss";

const families = ["primary", "secondary", "tertiary", "success", "warning", "error", "surface"];
const pairs = [
  [50, 950],
  [100, 900],
  [200, 800],
  [300, 700],
  [400, 600],
  [600, 400],
  [700, 300],
  [800, 200],
  [900, 100],
  [950, 50],
];

describe("default theme light-dark pairings", () => {
  it("generates normal and contrast pairings for every palette family", () => {
    for (const family of families) {
      for (const [light, dark] of pairs) {
        expect(LIGHT_DARK_PAIRINGS_CSS).toContain(
          `--color-${family}-${light}-${dark}: light-dark(var(--color-${family}-${light}), var(--color-${family}-${dark}));`,
        );
        expect(LIGHT_DARK_PAIRINGS_CSS).toContain(
          `--color-${family}-contrast-${light}-${dark}: light-dark(var(--color-${family}-contrast-${light}), var(--color-${family}-contrast-${dark}));`,
        );
      }
    }
  });

  it("includes the pairings in the default theme body", () => {
    expect(DEFAULT_THEME_BODY).toContain("--color-primary-50-950: light-dark(");
    expect(DEFAULT_THEME_BODY).toContain("--color-surface-contrast-950-50: light-dark(");
    expect(DEFAULT_THEME_BODY).toContain("--color-error-contrast-100-900: light-dark(");
  });
});
