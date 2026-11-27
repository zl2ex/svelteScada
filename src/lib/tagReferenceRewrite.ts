export type TagPathMapping = {
  oldPath: string;
  newPath: string;
};

/**
 * Decodes JavaScript string-literal escape sequences in raw literal contents.
 *
 * @param raw - Raw text between the quotes of a string literal
 * @returns The decoded string, with invalid escapes left as literal text
 */
function decodeJsString(raw: string): string {
  let value = "";
  for (let index = 0; index < raw.length; index++) {
    const char = raw[index];
    if (char !== "\\") {
      value += char;
      continue;
    }

    const next = raw[++index];
    if (next === undefined) break;
    switch (next) {
      case "n":
        value += "\n";
        break;
      case "r":
        value += "\r";
        break;
      case "t":
        value += "\t";
        break;
      case "b":
        value += "\b";
        break;
      case "f":
        value += "\f";
        break;
      case "v":
        value += "\v";
        break;
      case "0":
        value += "\0";
        break;
      case "x": {
        const hex = raw.slice(index + 1, index + 3);
        if (/^[0-9a-f]{2}$/i.test(hex)) {
          value += String.fromCharCode(Number.parseInt(hex, 16));
          index += 2;
        } else {
          value += "x";
        }
        break;
      }
      case "u": {
        if (raw[index + 1] === "{") {
          const end = raw.indexOf("}", index + 2);
          const hex = end === -1 ? "" : raw.slice(index + 2, end);
          if (/^[0-9a-f]+$/i.test(hex)) {
            value += String.fromCodePoint(Number.parseInt(hex, 16));
            index = end;
          } else {
            value += "u";
          }
        } else {
          const hex = raw.slice(index + 1, index + 5);
          if (/^[0-9a-f]{4}$/i.test(hex)) {
            value += String.fromCharCode(Number.parseInt(hex, 16));
            index += 4;
          } else {
            value += "u";
          }
        }
        break;
      }
      case "\n":
        break;
      case "\r":
        if (raw[index + 1] === "\n") index++;
        break;
      default:
        value += next;
        break;
    }
  }
  return value;
}

/**
 * Escapes a string for embedding inside a JavaScript literal with the given quote.
 *
 * @param value - Decoded string to escape
 * @param quote - Quote character used by the target literal
 * @returns The escaped literal contents
 */
function encodeJsString(value: string, quote: string): string {
  let encoded = "";
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (char === "\\") encoded += "\\\\";
    else if (char === quote) encoded += `\\${quote}`;
    else if (char === "\n") encoded += "\\n";
    else if (char === "\r") encoded += "\\r";
    else if (char === "\t") encoded += "\\t";
    else if (quote === "`" && char === "$" && value[index + 1] === "{") encoded += "\\$";
    else encoded += char;
  }
  return encoded;
}

/**
 * Checks that a path match starts and ends on valid path boundaries.
 *
 * @param value - Text being scanned
 * @param index - Start index of the candidate match
 * @param length - Length of the candidate match
 * @returns True when the surrounding characters do not continue the path
 */
function hasPathBoundary(value: string, index: number, length: number): boolean {
  const before = index === 0 ? undefined : value[index - 1];
  const after = value[index + length];
  if (before && /[A-Za-z0-9_/.-]/.test(before)) return false;
  if (after && /[A-Za-z0-9_-]/.test(after)) return false;
  return true;
}

/**
 * Replaces every boundary-matched old path in a value with its new path.
 *
 * @param value - Decoded string to rewrite
 * @param mappings - Path mappings to apply
 * @returns The rewritten string, or null when nothing changed
 */
function replacePath(value: string, mappings: TagPathMapping[]): string | null {
  let output = "";
  let index = 0;
  let changed = false;

  while (index < value.length) {
    const mapping = mappings.find(
      (item) =>
        item.oldPath &&
        item.oldPath !== item.newPath &&
        value.startsWith(item.oldPath, index) &&
        hasPathBoundary(value, index, item.oldPath.length),
    );

    if (mapping) {
      output += mapping.newPath;
      index += mapping.oldPath.length;
      changed = true;
      continue;
    }

    output += value[index];
    index++;
  }

  return changed ? output : null;
}

/**
 * Heuristically decides whether a slash may start a regular expression.
 *
 * @param previous - The previous significant non-whitespace character
 * @returns True when the previous character can precede a regex literal
 */
function canStartRegex(previous: string): boolean {
  return !previous || "([{=,:;!&|?+-*%^~<>".includes(previous);
}

/**
 * Skips over a regular expression literal starting at the given slash.
 *
 * @param text - Text being scanned
 * @param start - Index of the opening slash
 * @returns The index just past the closing slash, or the end of text
 */
function skipRegex(text: string, start: number): number {
  let index = start + 1;
  let escaped = false;
  let inCharacterClass = false;

  while (index < text.length) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      index++;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      index++;
      continue;
    }
    if (char === "[") inCharacterClass = true;
    else if (char === "]") inCharacterClass = false;
    else if (char === "/" && !inCharacterClass) return index + 1;
    index++;
  }

  return index;
}

/**
 * Rewrites quoted tag-path literals in a binding expression or event script.
 *
 * The scanner only changes JavaScript string literals ('...', "...", and backticks without
 * interpolation). It matches exact paths and descendant paths using "." or "/" boundaries,
 * and leaves comments, identifiers, dynamic template strings, and unrelated text unchanged.
 *
 * @param text - The binding expression or event script to rewrite
 * @param mappings - Path changes to apply to quoted literals
 * @returns The rewritten script with quoted tag paths updated
 */
export function rewriteQuotedTagPaths(text: string, mappings: TagPathMapping[]): string {
  if (!text || mappings.length === 0) return text;

  const sortedMappings = [...mappings]
    .filter((mapping) => mapping.oldPath && mapping.oldPath !== mapping.newPath)
    .sort((a, b) => b.oldPath.length - a.oldPath.length);
  if (sortedMappings.length === 0) return text;

  let output = "";
  let index = 0;
  let previousSignificant = "";

  while (index < text.length) {
    const char = text[index];

    if (char === "/" && text[index + 1] === "/") {
      const end = text.indexOf("\n", index + 2);
      const next = end === -1 ? text.length : end;
      output += text.slice(index, next);
      index = next;
      continue;
    }

    if (char === "/" && text[index + 1] === "*") {
      const end = text.indexOf("*/", index + 2);
      const next = end === -1 ? text.length : end + 2;
      output += text.slice(index, next);
      index = next;
      continue;
    }

    if (char === "/" && canStartRegex(previousSignificant)) {
      const end = skipRegex(text, index);
      output += text.slice(index, end);
      index = end;
      previousSignificant = "/";
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      const quote = char;
      let cursor = index + 1;
      let escaped = false;
      let hasInterpolation = false;

      while (cursor < text.length) {
        const inner = text[cursor];
        if (escaped) {
          escaped = false;
          cursor++;
          continue;
        }
        if (inner === "\\") {
          escaped = true;
          cursor++;
          continue;
        }
        if (quote === "`" && inner === "$" && text[cursor + 1] === "{") {
          hasInterpolation = true;
        }
        if (inner === quote) break;
        cursor++;
      }

      if (cursor >= text.length) {
        output += text.slice(index);
        break;
      }

      const raw = text.slice(index + 1, cursor);
      if (!hasInterpolation) {
        const replacement = replacePath(decodeJsString(raw), sortedMappings);
        if (replacement !== null) {
          output += `${quote}${encodeJsString(replacement, quote)}${quote}`;
        } else {
          output += text.slice(index, cursor + 1);
        }
      } else {
        output += text.slice(index, cursor + 1);
      }

      index = cursor + 1;
      previousSignificant = "a";
      continue;
    }

    output += char;
    if (!/\s/.test(char)) previousSignificant = char;
    index++;
  }

  return output;
}

/**
 * Builds path-change mappings by comparing path maps before and after a rename or move.
 *
 * @param before - Map of tag id to path before the change
 * @param after - Map of tag id to path after the change
 * @returns Mappings for ids whose path changed
 */
export function diffTagPathMappings(
  before: Map<string, string>,
  after: Map<string, string>,
): TagPathMapping[] {
  const mappings: TagPathMapping[] = [];
  for (const [id, oldPath] of before) {
    const newPath = after.get(id);
    if (newPath && newPath !== oldPath) {
      mappings.push({ oldPath, newPath });
    }
  }
  return mappings;
}
