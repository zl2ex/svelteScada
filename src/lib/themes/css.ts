const CLASS_NAME_PATTERN = /\.(-?[_a-zA-Z]+[_a-zA-Z0-9-]*)/g;
const CSS_VARIABLE_PATTERN = /(--[a-zA-Z0-9-_]+)\s*:/g;
const LEADING_THEME_SELECTOR =
  /^(\s*(?:\/\*[\s\S]*?\*\/\s*)*)\[data-theme=(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\]\s]+)\]/;

/**
 * Escapes a theme name for safe use inside a double-quoted selector.
 *
 * @param name - Raw theme name
 * @returns The name with backslashes and double quotes escaped
 */
function escapeThemeName(name: string) {
  return name.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

/**
 * Wraps CSS body in a data-theme selector block.
 *
 * @param name - Theme name used in the selector
 * @param body - CSS declarations to place inside the block
 * @returns The wrapped stylesheet text
 */
export function wrapThemeCss(name: string, body: string) {
  return `[data-theme="${escapeThemeName(name)}"] {\n${body.trim()}\n}\n`;
}

/**
 * Ensures theme CSS is scoped to the given theme selector.
 *
 * Existing leading data-theme selectors are rewritten; otherwise the CSS is wrapped.
 *
 * @param name - Theme name to scope the CSS to
 * @param css - The theme stylesheet text
 * @returns The scoped stylesheet text
 */
export function enforceThemeCss(name: string, css: string) {
  const trimmed = css.trim();
  if (!trimmed) return wrapThemeCss(name, "");

  if (LEADING_THEME_SELECTOR.test(trimmed)) {
    return trimmed.replace(
      LEADING_THEME_SELECTOR,
      (_match, prefix: string) => `${prefix}[data-theme="${escapeThemeName(name)}"]`,
    );
  }

  return wrapThemeCss(name, trimmed);
}

/**
 * Extracts the inner CSS from a wrapped theme block.
 *
 * @param css - The wrapped stylesheet text
 * @returns The inner declarations, or the trimmed input when no block is found
 */
export function unwrapThemeCss(css: string) {
  const start = css.indexOf("{");
  const end = css.lastIndexOf("}");
  if (start === -1 || end <= start) return css.trim();
  return css.slice(start + 1, end).trim();
}

/**
 * Collects all class names referenced in CSS selectors.
 *
 * @param css - Stylesheet text to scan
 * @returns A sorted, de-duplicated list of class names without the leading dot
 */
export function extractCssClassNames(css: string) {
  const names = new Set<string>();
  for (const match of css.matchAll(CLASS_NAME_PATTERN)) {
    if (match[1]) names.add(match[1]);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/**
 * Collects all custom property names declared in CSS.
 *
 * @param css - Stylesheet text to scan
 * @returns A sorted, de-duplicated list of CSS variable names including the leading `--`
 */
export function extractCssVariableNames(css: string) {
  const names = new Set<string>();
  for (const match of css.matchAll(CSS_VARIABLE_PATTERN)) {
    if (match[1]) names.add(match[1]);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/**
 * Wraps CSS in a style tag, escaping any closing style tags in the content.
 *
 * @param css - Stylesheet text to embed
 * @returns A `<style>` element string safe for HTML injection
 */
export function themeStyleTag(css: string) {
  return `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`;
}
