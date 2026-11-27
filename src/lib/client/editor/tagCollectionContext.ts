import { getContext, setContext } from "svelte";
import type { PatchCollection } from "$lib/client/live/patchCollection.svelte";
import type { TagOptionsInput } from "$lib/server/tag/tag";
import type { NeverThrowError } from "$lib/util/neverThrow";

export type TagCollection = PatchCollection<TagOptionsInput, NeverThrowError>;

const key = Symbol("tag-collection");

/**
 * Stores the tag collection in Svelte context.
 *
 * @param collection - Tag collection to provide to descendants
 */
export function setTagCollectionContext(collection: TagCollection) {
  setContext(key, collection);
}

/**
 * Reads the tag collection from Svelte context.
 *
 * @returns The provided tag collection
 * @throws {Error} when called before a provider sets the collection
 */
export function getTagCollectionContext(): TagCollection {
  const collection = getContext<TagCollection | undefined>(key);
  if (!collection) throw Error("getTagCollectionContext() called before its provider");
  return collection;
}
