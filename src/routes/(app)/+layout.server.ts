import { server } from "../../server/socketIoHandler";

export async function load({ locals })
{
    return {
        user: locals.user
        //tags: server.tags
    }
}