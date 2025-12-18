import type { RequestEvent } from "./$types";
import { redirect } from "@sveltejs/kit";
import { registerUser } from "$lib/server/auth/auth";

export async function load(event: RequestEvent) {
  const user = event.cookies.get("user");

  if (user) redirect(302, "/");
}

export const actions = {
  register: async (event: RequestEvent) => {
    return registerUser(event);
  },
};
