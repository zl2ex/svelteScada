import { getContext, setContext } from "svelte";
import type { PatchCollection } from "$lib/client/live/patchCollection.svelte";
import type { UdtDefinitionInput } from "$lib/sqlite/tables/udt_definitions";
import type { NeverThrowError } from "$lib/util/neverThrow";

export type UdtDefinitionCollection = PatchCollection<UdtDefinitionInput, NeverThrowError>;

const key = Symbol("udt-definitions");

export function setUdtDefinitionsContext(collection: UdtDefinitionCollection) {
  setContext(key, collection);
}

export function getUdtDefinitionsContext(): UdtDefinitionCollection {
  const collection = getContext<UdtDefinitionCollection | undefined>(key);
  if (!collection) throw Error("getUdtDefinitionsContext() called before its provider");
  return collection;
}
