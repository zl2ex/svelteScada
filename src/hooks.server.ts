import type { Handle } from "@sveltejs/kit";
import { parse } from "cookie";
import jwt from 'jsonwebtoken';
import { dataBaseConnect } from "./lib/mongoose/db";
import { UserModel } from "$lib/mongoose/user/user";
import { PRIVATE_KEY } from "$env/static/private";


type SessionUser = {
    id: string;
    username: string;
};

await dataBaseConnect();

export const handle: Handle = async ({ event, resolve }) => {
    console.log("handleHook");
    const { headers } = event.request;
    const cookies = parse(headers.get("cookie") ?? "");
   
    if (cookies.AuthorizationToken)
    {
        // Remove Bearer prefix
        const token = cookies.AuthorizationToken.split(" ")[1];
    
        try 
        {
            const jwtUser = jwt.verify(token, PRIVATE_KEY);
            if (typeof jwtUser === "string") 
            {
                throw new Error("Something went wrong");
            }

            console.log(jwtUser);
   
            const user = await UserModel.findOne({_id: jwtUser._id });
    
            if (!user) 
            {
                throw new Error("User not found");
            }
    
            const sessionUser: SessionUser = {
                id: user.id,
                username: user.username,
            };
            
            console.log(sessionUser);
            event.locals.user = sessionUser;

        } 
        catch (error)
        {
            console.error(error);
        }
    }
    else 
    {
        console.log("no cookie provided");
    }
   
    return await resolve(event);
  };