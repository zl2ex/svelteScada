import type { RequestEvent } from './$types';
import { logoutUser } from '$lib/server/auth/auth';


export const actions = {
    logout: async (event: RequestEvent) => {

        return logoutUser(event);
    }
}