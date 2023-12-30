import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { PageServerLoad, RequestEvent } from './$types';
import { PRIVATE_KEY, JWT_EXPERATION_TIME } from '$env/static/private';
import { UserModel } from '$lib/mongoose/user/user';
import { redirect } from '@sveltejs/kit';

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


export const load: PageServerLoad = (event) => {

    console.log("/login/page.server.ts Load");
    const user = event.locals.user;

    console.log(user);
   
    if (user) {
      redirect(302, '/');
    }
};

export const actions = {
    login: async (event: RequestEvent) => {

        const data = await event.request.formData();
        const email = data.get('email') as string;
        const password = data.get('password') as string;

        if(!email) return { sucsess: false, message: "No email provided" };
        //if(validateEmail(email)) return { sucsess: false, message: "Email Not Valid" };
        if(!password) return { sucsess: false, message: "No Password Provided" };

        const user = await UserModel.findOne({email});

        console.log(user);
        
        var passwordCorrect = false;
        if(user) passwordCorrect = await bcrypt.compare(password, user.password);

        if(!passwordCorrect) return { sucsess: false, message: "Invalid Credentials" };

    
        const token = jwt.sign({ _id: user._id, email: user.email }, PRIVATE_KEY, {
            algorithm: "RS256",
            expiresIn: JWT_EXPERATION_TIME
        });

         // Set the cookie
        event.cookies.set('AuthorizationToken', `Bearer ${token}`, {
            httpOnly: true,
            path: '/',
            secure: true,
            sameSite: 'strict',
            maxAge: 60 * 60 * 24 // 1 day
        });
   
        redirect(302, '/');
    }
}
