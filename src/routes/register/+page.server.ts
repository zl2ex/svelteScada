import type { PageServerLoad, RequestEvent } from './$types';
import { users } from '$lib/mongodb/user';
import { redirect } from '@sveltejs/kit';
import { registerUser } from '$lib/auth/auth';


export async function load(event: RequestEvent) 
{
    const user = event.cookies.get('user');
    console.log("token", user);
   
    if (user) redirect(302, '/');
};

export const actions = {
    register: async (event: RequestEvent) => {

        return registerUser(event);
    }
}
