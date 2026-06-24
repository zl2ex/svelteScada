// See https://kit.svelte.dev/docs/types#app

import type { User } from "$lib/server/sqlite/tables";

// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      user: User | undefined;
    }
    // interface PageData {}
    // interface Platform {}
  }
}

export {};
