/// <reference types="vite/client" />

// See https://kit.svelte.dev/docs/types#app

import type { AppAbility, SessionUser } from "$lib/permissions/ability";

// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      user: SessionUser | undefined;
      ability: AppAbility;
    }
    // interface PageData {}
    // interface Platform {}
  }
}

export {};
