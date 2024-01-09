import { tagsServerRef } from "../../server/socketIoHandler";
import { tagsInit } from "$lib/tag/tags";

export function load() {
	return { tags: tagsInit };
}