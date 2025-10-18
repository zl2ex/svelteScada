import type { RequestEvent } from "./$types";
import { redirect } from "@sveltejs/kit";
import { loginUser } from "$lib/server/auth/auth";

export async function load(event: RequestEvent) {
  const user = event.cookies.get("user");
  console.log("token", user);

  if (user) redirect(302, event.url.searchParams.get("redirect") || "/");
}

export const actions = {
  login: async (event: RequestEvent) => {
    return loginUser(event);
  },
};
