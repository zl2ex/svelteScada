// See https://kit.svelte.dev/docs/types#app

import type { User } from "$lib/server/mongodb/user";

// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: User | null
		}
		// interface PageData {}
		// interface Platform {}
	}
}

export {};
