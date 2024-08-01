import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import type { RequestEvent } from "../../routes/$types";
import { PRIVATE_KEY, JWT_EXPERATION_TIME } from '$env/static/private';
import { users, type User } from '$lib/mongodb/user';
import { redirect, error } from '@sveltejs/kit';
import { parse } from "cookie";


export async function registerUser(event: RequestEvent)
{
    const data = await event.request.formData();
    const email = data.get('email') as string;
    const password = data.get('password') as string;

    if(!email) return { sucsess: false, message: "No email provided" };
    //if(validateEmail(email)) return { sucsess: false, message: "Email Not Valid" };
    if(!password) return { sucsess: false, message: "No Password Provided" };

    console.log(email, password, "form submit");


    const user = users.findOne({email});
    if(user) return { sucsess: false, message: "User with that email already exists" };

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    await users.insertOne({ email, password: hashedPassword });

    return { sucsess: true, data: "JWT" };
}


export async function loginUser(event: RequestEvent)
{
    const data = await event.request.formData();
    const email = data.get('email') as string;
    const password = data.get('password') as string;

    if(!email) return { sucsess: false, message: "No email provided" };
    if(!password) return { sucsess: false, message: "No password provided" };

    const user = await users.findOne({email});
    if(!user) return { sucsess: false, message: "Invalid Credentials" };

    var passwordCorrect = await bcrypt.compare(password, user.password); 
    if(!passwordCorrect) return { sucsess: false, message: "Invalid Credentials" };
    
    const token = jwt.sign({ email: user.email }, PRIVATE_KEY, {
        algorithm: "RS256",
        expiresIn: JWT_EXPERATION_TIME
    });

    // Set the cookie
    event.cookies.set('token', `Bearer ${token}`, {
        httpOnly: true,
        path: '/',
        secure: false, // WIP DEV ONLY FOR HOSTING -- change to true for production
        sameSite: 'strict',
        maxAge: 60 * 60 * 24 * 360 // 1 Year
    });

    redirect(302, '/');
}

export function logoutUser(event: RequestEvent) {
    event.cookies.delete('token', { path: '/' });
}

export async function authenticateUser(event: RequestEvent): Promise<User | null>
{
    const cookies = parse(event.request.headers.get("cookie") ?? "");

    if (cookies.token)
    {
        // Remove Bearer prefix
        const token = cookies.token.split(" ")[1];

        try
        {
            const jwtUser = jwt.verify(token, PRIVATE_KEY);
            console.log("jwtUser", jwtUser);
            const user = await users.findOne({email: jwtUser.email }, {projection: {_id: false}});
            return user;
        } 
        catch (err)
        {
            console.error(err);
            error(500, { message: 'Internal Error' });
        }
    }

    return null;
}