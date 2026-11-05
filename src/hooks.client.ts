import { redirectToLogin } from "$lib/client/authRedirect";

const AUTH_REDIRECT_FETCH = Symbol.for("svelteScada.authRedirectFetch");
const REMOTE_PATH_PREFIX = "/_app/remote/";

function isRemoteRequest(input: Parameters<typeof fetch>[0]) {
  const url = input instanceof Request ? input.url : String(input);
  return new URL(url, window.location.href).pathname.startsWith(REMOTE_PATH_PREFIX);
}

export function init() {
  if ((window.fetch as any)[AUTH_REDIRECT_FETCH]) return;

  const originalFetch = window.fetch;

  const patchedFetch: typeof fetch = async (input, init) => {
    const response = await originalFetch.call(window, input, init);

    if (response.status === 401 && isRemoteRequest(input)) {
      redirectToLogin();
    }

    return response;
  };

  Object.defineProperty(patchedFetch, AUTH_REDIRECT_FETCH, { value: true });
  window.fetch = patchedFetch;
}
