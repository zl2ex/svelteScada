import { getContext, setContext } from "svelte";
import type { PatchCollection } from "$lib/client/live/patchCollection.svelte";
import type { TagOptionsInput } from "$lib/server/tag/tag";
import type { NeverThrowError } from "$lib/util/neverThrow";

export type TagCollection = PatchCollection<TagOptionsInput, NeverThrowError>;

const key = Symbol("tag-collection");

export function setTagCollectionContext(collection: TagCollection) {
  setContext(key, collection);
}

export function getTagCollectionContext(): TagCollection {
  const collection = getContext<TagCollection | undefined>(key);
  if (!collection) throw Error("getTagCollectionContext() called before its provider");
  return collection;
}
