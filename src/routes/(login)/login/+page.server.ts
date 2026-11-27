import { authenticateUser } from "$lib/server/auth/auth";
import type { RequestEvent } from "./$types";
import { redirect } from "@sveltejs/kit";

/**
 * Load the login page, redirecting already-authenticated users onward.
 *
 * @param event - the SvelteKit request event carrying cookies and URL
 * @returns nothing when the token is invalid, after clearing it
 * @throws {Redirect} when a valid session redirects to the requested target
 */
export async function load(event: RequestEvent) {
  const result = await authenticateUser(event.cookies.get("token") ?? "");
  if (result.isErr()) {
    event.cookies.delete("token", { path: "/" });
    return;
  }
  redirect(302, event.url.searchParams.get("redirect") || "/");
}
