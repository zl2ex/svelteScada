import { server } from "../../server/socketIoHandler";

export async function load() 
{
	// TODO AUTH
	//console.log("+layout.server.ts getTagsServer()", getTagsServer());
	return {
		tags: server.tags
	};
}