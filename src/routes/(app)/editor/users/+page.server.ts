import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { assertCan } from "$lib/server/auth/authorize";
import { db } from "$lib/server/sqlite/db";
import { attempt } from "$lib/util/attempt";
import { errorToString } from "$lib/util/neverThrow";

export const load: PageServerLoad = async ({ locals }) => {
  assertCan(locals.ability, "manage", "User");

  const users = await attempt(() =>
    db.query.users.findMany({
      columns: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
      with: {
        permissions: true,
      },
    }),
  );
  if (users.isErr) {
    error(500, `[editor/users] failed to load users: ${errorToString(users.error)}`);
  }

  return { users: users.data };
};
