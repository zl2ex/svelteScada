const MAX_CLONE_DEPTH = 8;

export function clonePlain<T>(value: T, depth = 0, seen = new WeakMap<object, unknown>()): T {
  if (value === null || typeof value !== "object") return value;

  if (depth > MAX_CLONE_DEPTH) return undefined as T;

  if (value instanceof Date) return value.toISOString() as T;

  if (value instanceof Error) {
    return { name: value.name, message: value.message } as T;
  }

  const existing = seen.get(value);
  if (existing !== undefined) return existing as T;

  if (Array.isArray(value)) {
    const clone: unknown[] = [];
    seen.set(value, clone);
    for (const item of value) clone.push(clonePlain(item, depth + 1, seen));
    return clone as T;
  }

  if (value instanceof Map) {
    const clone = new Map<unknown, unknown>();
    seen.set(value, clone);
    for (const [key, item] of value) {
      clone.set(clonePlain(key, depth + 1, seen), clonePlain(item, depth + 1, seen));
    }
    return clone as T;
  }

  if (value instanceof Set) {
    const clone = new Set<unknown>();
    seen.set(value, clone);
    for (const item of value) clone.add(clonePlain(item, depth + 1, seen));
    return clone as T;
  }

  const clone: Record<string, unknown> = {};
  seen.set(value, clone);
  for (const key of Object.keys(value)) {
    const item = (value as Record<string, unknown>)[key];
    if (typeof item === "function") continue;
    clone[key] = clonePlain(item, depth + 1, seen);
  }
  return clone as T;
}
