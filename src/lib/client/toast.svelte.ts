import { browser } from "$app/environment";
import { createToaster } from "@skeletonlabs/skeleton-svelte";
import type { Options, Store } from "@zag-js/toast";
import type { ToastMessage } from "../../live/toast";
import { toastPush } from "$live/toast";
import { err, ok } from "neverthrow";
import { attempt } from "$lib/util/attempt";
import { newId } from "$lib/util/newId";
import { errorToString, type NeverThrowError } from "$lib/util/neverThrow";

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

export function getToaster() {
  if (!browser) {
    return err({
      reason: "TOASTER_UNAVAILABLE",
      cause: "toast getToaster() is only available in the browser",
    } as const satisfies NeverThrowError);
  }

  if (_toaster) return ok(_toaster);

  const created = attempt(() =>
    createToaster({ placement: "bottom-end", max: 5 }),
  );
  if (created.error) {
    return err({
      reason: "TOASTER_CREATE_FAILED",
      cause: errorToString(created.error),
    } as const satisfies NeverThrowError);
  }

  _toaster = created.data;
  return ok(_toaster);
}

function pushToaster(options: Options) {
  const toaster = getToaster();
  if (toaster.isErr()) return err(toaster.error);

  const pushed = attempt(() => toaster.value.create(options));
  if (pushed.error) {
    return err({
      reason: "TOAST_CREATE_FAILED",
      cause: errorToString(pushed.error),
    } as const satisfies NeverThrowError);
  }

  return ok(toaster.value);
}

// Local client push: call from any client component without hitting the server.
export function toast(message: Omit<ToastMessage, "id">) {
  return pushToaster(toastOptions(message));
}

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
  if (subscribed.error) {
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
