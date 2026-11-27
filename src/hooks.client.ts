import { redirectToLogin } from "$lib/client/authRedirect";

const AUTH_REDIRECT_FETCH = Symbol.for("svelteScada.authRedirectFetch");
const REMOTE_PATH_PREFIX = "/_app/remote/";

/**
 * Determine whether a fetch input targets the remote function endpoint.
 *
 * @param input - the fetch input, either a URL, string, or Request
 * @returns true when the resolved pathname starts with the remote prefix
 */
function isRemoteRequest(input: Parameters<typeof fetch>[0]) {
  const url = input instanceof Request ? input.url : String(input);
  return new URL(url, window.location.href).pathname.startsWith(REMOTE_PATH_PREFIX);
}

/**
 * Install the client fetch wrapper that redirects to login on remote 401s.
 *
 * Side effect: replaces `window.fetch` with a patched implementation once.
 */
export function init() {
  if ((window.fetch as any)[AUTH_REDIRECT_FETCH]) return;

  const originalFetch = window.fetch;

  /**
   * Fetch wrapper that redirects to login when a remote call returns 401.
   *
   * @param input - the fetch input passed through to the original fetch
   * @param init - optional fetch init passed through to the original fetch
   * @returns the original response, after any redirect side effect
   */
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
