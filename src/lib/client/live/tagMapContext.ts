import { getContext, setContext } from "svelte";
import type { TagValueMap } from "$lib/client/live/tagMap.svelte";

const tagValueMapKey = Symbol("tag-value-map");

export function setTagValueMapContext(tagValueMap: TagValueMap) {
  setContext(tagValueMapKey, tagValueMap);
}

export function getTagValueMapContext() {
  const tagValueMap = getContext<TagValueMap | undefined>(tagValueMapKey);
  if (!tagValueMap) {
    throw Error("getTagValueMapContext() called before setTagValueMapContext()");
  }
  return tagValueMap;
}
