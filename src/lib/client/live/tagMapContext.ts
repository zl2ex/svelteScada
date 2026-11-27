import { getContext, setContext } from "svelte";
import type { TagValueMap } from "$lib/client/live/tagMap.svelte";

const tagValueMapKey = Symbol("tag-value-map");

/**
 * Stores the tag value map in the current Svelte context.
 *
 * @param tagValueMap - tag value map to make available to descendants
 */
export function setTagValueMapContext(tagValueMap: TagValueMap) {
  setContext(tagValueMapKey, tagValueMap);
}

/**
 * Reads the tag value map from the current Svelte context.
 *
 * @returns the tag value map set by `setTagValueMapContext`
 * @throws {Error} when called before `setTagValueMapContext`
 */
export function getTagValueMapContext() {
  const tagValueMap = getContext<TagValueMap | undefined>(tagValueMapKey);
  if (!tagValueMap) {
    throw Error("getTagValueMapContext() called before setTagValueMapContext()");
  }
  return tagValueMap;
}
