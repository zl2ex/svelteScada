import { server } from "../../server/socketIoHandler";
import { tagsInit } from "$lib/tag/tags";


export function load() {
	// TODO AUTH
	//console.log("+layout.server.ts getTagsServer()", getTagsServer());
	return {
		tags: server.tags
	};
}