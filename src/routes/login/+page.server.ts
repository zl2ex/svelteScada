import type { PageServerLoad, RequestEvent } from './$types';
import { users } from '$lib/mongodb/user';
import { redirect } from '@sveltejs/kit';
import { loginUser } from '$lib/auth/auth';


export async function load(event: RequestEvent) 
{
    const user = event.cookies.get('user');
    console.log("token", user);
   
    if (user) redirect(302, '/');
};

export const actions = {
    login: async (event: RequestEvent) => {

        return loginUser(event);
    }
}
