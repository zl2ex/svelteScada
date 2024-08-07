import { server } from "../../../server/socketIoHandler";

export async function load({cookies, locals})
{
    return {
        user: locals.user,
        tags: server.tags
    }
}