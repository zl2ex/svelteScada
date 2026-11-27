import { attempt } from "./attempt";

let idCounter = 0;

/**
 * Generates a unique identifier, preferring `crypto.randomUUID`.
 *
 * Falls back to a timestamp and counter when randomUUID is unavailable or throws.
 *
 * @returns A UUID string, or a generated `id-<timestamp>-<counter>` fallback
 */
export function newId(): string {
  const uuid = attempt(() => crypto.randomUUID?.());
  if (uuid.isErr || !uuid.data) return `id-${Date.now()}-${idCounter++}`;
  return uuid.data;
}
