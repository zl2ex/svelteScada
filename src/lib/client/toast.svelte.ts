import { browser } from "$app/environment";
import { createToaster } from "@skeletonlabs/skeleton-svelte";
import type { Options, Store } from "@zag-js/toast";
import type { ToastMessage } from "../../live/toast";
import { toastPush } from "$live/toast";
import { err, ok } from "neverthrow";
import { attempt } from "$lib/util/attempt";
import { newId } from "$lib/util/newId";
import { errorToString, type NeverThrowError } from "$lib/util/neverThrow";

/**
 * Converts a toast message into zag-js toast options with a fresh id.
 *
 * @param message - toast payload without an id
 * @returns the toast options accepted by the toaster
 */
function toastOptions(message: Omit<ToastMessage, "id">): Options {
  return {
    id: newId(),
    type: message.kind,
    title: message.title,
    description: message.description,
    duration: message.duration,
  };
}

let _toaster: Store | undefined;

/**
 * Returns the shared toaster instance, creating it on first use.
 *
 * Only available in the browser.
 *
 * @returns Ok with the toaster, or Err when unavailable or creation fails
 */
export function getToaster() {
  if (!browser) {
    return err({
      reason: "TOASTER_UNAVAILABLE",
      cause: "toast getToaster() is only available in the browser",
    } as const satisfies NeverThrowError);
  }

  if (_toaster) return ok(_toaster);

  const created = attempt(() => createToaster({ placement: "bottom-end", max: 5 }));
  if (created.isErr) {
    return err({
      reason: "TOASTER_CREATE_FAILED",
      cause: errorToString(created.error),
    } as const satisfies NeverThrowError);
  }

  _toaster = created.data;
  return ok(_toaster);
}

/**
 * Pushes the given options onto the shared toaster.
 *
 * @param options - toast options to display
 * @returns Ok with the toaster, or Err when the toaster or push fails
 */
function pushToaster(options: Options) {
  const toaster = getToaster();
  if (toaster.isErr()) return err(toaster.error);

  // @ts-ignore
  const pushed = attempt(() => toaster.value.create(options));
  if (pushed.isErr) {
    return err({
      reason: "TOAST_CREATE_FAILED",
      cause: errorToString(pushed.error),
    } as const satisfies NeverThrowError);
  }

  return ok(toaster.value);
}

/**
 * Displays a local client toast without hitting the server.
 *
 * @param message - toast payload without an id
 * @returns Ok with the toaster, or Err when the toast cannot be shown
 */
export function toast(message: Omit<ToastMessage, "id">) {
  return pushToaster(toastOptions(message));
}

/**
 * Subscribes to server-pushed toast messages and forwards them to the toaster.
 *
 * @returns Ok when subscribed, or Err when the subscription fails
 */
function subscribeToastPush() {
  const subscribed = attempt(() =>
    toastPush.subscribe((message: ToastMessage | undefined) => {
      if (!message) return;
      pushToaster({
        id: message.id,
        type: message.kind,
        title: message.title,
        description: message.description,
        duration: message.duration,
      });
    }),
  );
  if (subscribed.isErr) {
    return err({
      reason: "TOAST_SUBSCRIBE_FAILED",
      cause: errorToString(subscribed.error),
    } as const satisfies NeverThrowError);
  }

  return ok(undefined);
}

if (browser) {
  const subscribed = subscribeToastPush();
  if (subscribed.isErr()) {
    console.error(subscribed.error.reason, subscribed.error.cause);
  }
}
