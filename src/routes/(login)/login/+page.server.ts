import { authenticateUser } from "$lib/server/auth/auth";
import type { RequestEvent } from "./$types";
import { redirect } from "@sveltejs/kit";

export async function load(event: RequestEvent) {
  const result = await authenticateUser(event.cookies.get("token") ?? "");
  if (result.isErr()) {
    event.cookies.delete("token", { path: "/" });
    return;
  }
  redirect(302, event.url.searchParams.get("redirect") || "/");
}
