import { browser } from "$app/environment";
import { goto } from "$app/navigation";

let redirecting = false;

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
