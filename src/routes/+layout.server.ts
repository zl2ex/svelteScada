import { tagsServerRef } from "../../server/socketIoHandler";

export function load() {
	return { tags: tagsServerRef() };
}