import { browser } from "$app/environment";
import { createToaster } from "@skeletonlabs/skeleton-svelte";
import type { Options, Store } from "@zag-js/toast";
import type { ToastMessage } from "../../live/toast";
import { toastPush } from "$live/toast";

function toastOptions(message: Omit<ToastMessage, "id">): Options {
  return {
    id: newId(),
    type: message.kind,
    title: message.title,
    description: message.description,
    duration: message.duration,
  };
}

function newId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

let _toaster: Store | undefined;

export function getToaster(): Store {
  if (!browser) throw new Error("Toasts are only available in the browser");
  return (_toaster ??= createToaster({ placement: "bottom-end", max: 5 }));
}

// Local client push: call from any client component without hitting the server.
export function toast(message: Omit<ToastMessage, "id">) {
  getToaster().create(toastOptions(message));
}

if (browser) {
  toastPush.subscribe((message: ToastMessage | undefined) => {
    if (message)
      getToaster().create({
        id: message.id,
        type: message.kind,
        title: message.title,
        description: message.description,
        duration: message.duration,
      });
  });
}
