import { redirect, error, type Handle } from "@sveltejs/kit";
import { authenticateUser } from "$lib/auth/auth";



export const handle: Handle = async ({ event, resolve }) => {

    console.log("handleHook");

    event.locals.user = await authenticateUser(event);

    console.log(event.locals.user);

    // only the login page is unprotected uunless logged in
    if(event.locals.user || event.url.pathname.startsWith('/login') || event.url.pathname.startsWith('/register'))
    {
        return await resolve(event);
    }

    else
    {
        redirect(303, "/login");
    }
  };