import { authenticateUser } from "$lib/server/auth/auth";
import type { RequestEvent } from "./$types";
import { redirect } from "@sveltejs/kit";

export async function load(event: RequestEvent) {
  const user = await authenticateUser(event.cookies.get("token") ?? "");
  if (user) redirect(302, event.url.searchParams.get("redirect") || "/");
}
