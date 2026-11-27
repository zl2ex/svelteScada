import { getContext, setContext } from "svelte";
import type { PatchCollection } from "$lib/client/live/patchCollection.svelte";
import type { UdtDefinitionInput } from "$lib/sqlite/tables/udt_definitions";
import type { NeverThrowError } from "$lib/util/neverThrow";

export type UdtDefinitionCollection = PatchCollection<UdtDefinitionInput, NeverThrowError>;

const key = Symbol("udt-definitions");

/**
 * Stores the UDT definition collection in Svelte context.
 *
 * @param collection - UDT definition collection to provide to descendants
 */
export function setUdtDefinitionsContext(collection: UdtDefinitionCollection) {
  setContext(key, collection);
}

/**
 * Reads the UDT definition collection from Svelte context.
 *
 * @returns The provided UDT definition collection
 * @throws {Error} when called before a provider sets the collection
 */
export function getUdtDefinitionsContext(): UdtDefinitionCollection {
  const collection = getContext<UdtDefinitionCollection | undefined>(key);
  if (!collection) throw Error("getUdtDefinitionsContext() called before its provider");
  return collection;
}
