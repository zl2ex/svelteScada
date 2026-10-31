export function updateBinding<T extends object>(
  bindings: T | null | undefined,
  scope: keyof T,
  key: string | null,
  expression: string,
): T | null {
  const next = { ...bindings } as T;

  if (key === null) {
    if (expression.trim()) next[scope] = expression as T[keyof T];
    else delete next[scope];
  } else {
    const current = next[scope];
    if (current !== undefined && (typeof current !== "object" || current === null)) {
      throw new Error(`Binding scope "${String(scope)}" is not an expression map`);
    }

    const map = { ...(current as Record<string, string> | undefined) };
    if (expression.trim()) map[key] = expression;
    else delete map[key];

    if (Object.keys(map).length > 0) next[scope] = map as T[keyof T];
    else delete next[scope];
  }

  return Object.keys(next).length > 0 ? next : null;
}

export function formatBindingResult(value: unknown): string {
  if (value === undefined) return "";
  if (value === null) return "null";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value) ?? "";
    } catch {
      return String(value);
    }
  }
  return String(value);
}
