import { browser } from "$app/environment";
import { goto } from "$app/navigation";

let redirecting = false;

/**
 * Redirects the browser to the login page, preserving the current path as a
 * `redirect` query parameter.
 *
 * No-op outside the browser, on the login page, or while a redirect is already
 * in progress.
 */
export function redirectToLogin() {
  if (!browser || redirecting) return;

  const { pathname, search } = window.location;
  if (pathname.startsWith("/login")) return;

  redirecting = true;
  const loginUrl = `/login?redirect=${encodeURIComponent(pathname + search)}`;

  void goto(loginUrl).catch(() => {
    window.location.assign(loginUrl);
  });
}
