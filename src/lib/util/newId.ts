import { attempt } from "./attempt";

let idCounter = 0;

export function newId(): string {
  const uuid = attempt(() => crypto.randomUUID?.());
  if (uuid.error || !uuid.data) return `id-${Date.now()}-${idCounter++}`;
  return uuid.data;
}
