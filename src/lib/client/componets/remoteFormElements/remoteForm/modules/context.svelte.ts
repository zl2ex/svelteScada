import { type RemoteFormField } from "@sveltejs/kit";
import { createContext } from "svelte";

export const [getFeildContext, setFeildContext] =
  createContext<RemoteFormField<unknown>>();
