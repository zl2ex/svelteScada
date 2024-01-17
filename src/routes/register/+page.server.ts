import type { ActionData, PageServerLoad, RequestEvent } from './$types';
import { UserModel } from '$lib/mongoose/user/user';

// not working for some reason
function validateEmail(email: string):boolean
{
    const regex = /^([\w-]+(?:\.[\w-]+)*)@((?:[\w-]+\.)*\w[\w-]{0,66})\.([a-z]{2,6}(?:\.[a-z]{2})?)$/;
    if(regex.test(email))
    {
      return true;
    }
    return false;
}

export async function load() 
{
    return {

    };
}

export const actions = {
    register: async ({ cookies, request }: RequestEvent) => {

        const data = await request.formData();
        const username = data.get('username') as string;
        const email = data.get('email') as string;
        const password = data.get('password') as string;

        if(!username) return { sucsess: false, message: "No username provided" };
        if(!email) return { sucsess: false, message: "No email provided" };
        //if(validateEmail(email)) return { sucsess: false, message: "Email Not Valid" };
        if(!password) return { sucsess: false, message: "No Password Provided" };

        console.log(username, email, password, "form submit");

        return { sucsess: true, data: "JWT" };
    }
}
