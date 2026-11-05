const CLASS_NAME_PATTERN = /\.(-?[_a-zA-Z]+[_a-zA-Z0-9-]*)/g;
const LEADING_THEME_SELECTOR =
  /^(\s*(?:\/\*[\s\S]*?\*\/\s*)*)\[data-theme=(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\]\s]+)\]/;

function escapeThemeName(name: string) {
  return name.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export function wrapThemeCss(name: string, body: string) {
  return `[data-theme="${escapeThemeName(name)}"] {\n${body.trim()}\n}\n`;
}

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

export function unwrapThemeCss(css: string) {
  const start = css.indexOf("{");
  const end = css.lastIndexOf("}");
  if (start === -1 || end <= start) return css.trim();
  return css.slice(start + 1, end).trim();
}

export function extractCssClassNames(css: string) {
  const names = new Set<string>();
  for (const match of css.matchAll(CLASS_NAME_PATTERN)) {
    if (match[1]) names.add(match[1]);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function themeStyleTag(css: string) {
  return `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`;
}
