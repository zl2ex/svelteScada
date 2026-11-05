import { describe, expect, it } from "vitest";
import {
  enforceThemeCss,
  extractCssClassNames,
  unwrapThemeCss,
  wrapThemeCss,
} from "./css";

describe("theme css helpers", () => {
  it("wraps and unwraps theme css", () => {
    const body = ".input { color: red; }\n.input:hover { color: blue; }";
    const wrapped = wrapThemeCss("My Theme", body);

    expect(wrapped).toContain('[data-theme="My Theme"]');
    expect(unwrapThemeCss(wrapped).trim()).toBe(body);
  });

  it("replaces an existing theme selector with the current name", () => {
    const css = '[data-theme="old"] { .input { color: red; } }';

    expect(enforceThemeCss("New Name", css)).toBe(
      '[data-theme="New Name"] { .input { color: red; } }',
    );
  });

  it("handles leading comments and quoted selector variants", () => {
    const css = "/* theme */\n[data-theme='old'] { .btn { color: red; } }";

    expect(enforceThemeCss("New", css)).toBe(
      "/* theme */\n[data-theme=\"New\"] { .btn { color: red; } }",
    );
  });

  it("wraps css when the theme selector is missing", () => {
    const css = ".input { color: red; }";

    expect(enforceThemeCss("My Theme", css)).toBe(
      '[data-theme="My Theme"] {\n.input { color: red; }\n}\n',
    );
  });

  it("is idempotent", () => {
    const once = enforceThemeCss("Default", '[data-theme="wrong"] { color: red; }');

    expect(enforceThemeCss("Default", once)).toBe(once);
  });

  it("extracts unique class names", () => {
    expect(
      extractCssClassNames(
        '[data-theme="Default"] { & .input:hover, & .btn { color: red; } .input { padding: 1rem; } }',
      ),
    ).toEqual(["btn", "input"]);
  });
});
