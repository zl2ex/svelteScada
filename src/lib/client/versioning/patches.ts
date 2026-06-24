import type { Patch } from "immer";

export function squashPatches(patches: Patch[]): Patch[] {
  const seen = new Map<string, Patch>();
  for (const patch of patches) {
    const key = patch.path.join("/");
    // If a path was added then later removed, cancel both out
    if (patch.op === "remove" && seen.get(key)?.op === "add") {
      seen.delete(key);
    } else {
      seen.set(key, patch);
    }
  }
  return [...seen.values()];
}

// Custom merge function for svelte-realtime streams
// Applies an incoming patch event to the current record map
export function patchMerge<T extends Record<string, unknown>>(
  current: T | undefined,
  event: { type: string; data: unknown },
): T {
  const state = current ?? ({} as T);
  if (event.type !== "patched") return state;

  const { patches } = event.data as { patches: Patch[] };
  const next = { ...state };

  for (const patch of patches) {
    const [id, field] = patch.path as [string, string?];

    if (patch.op === "remove" && !field) {
      delete next[id as keyof T];
    } else if (patch.op === "add" && !field) {
      next[id as keyof T] = patch.value as T[keyof T];
    } else if (field) {
      const existing = (next[id as keyof T] ?? {}) as Record<string, unknown>;
      if (patch.op === "remove") {
        const updated = { ...existing };
        delete updated[field];
        next[id as keyof T] = updated as T[keyof T];
      } else {
        next[id as keyof T] = {
          ...existing,
          [field]: patch.value,
        } as T[keyof T];
      }
    }
  }

  return next;
}
