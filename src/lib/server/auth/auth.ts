import jwt from "jsonwebtoken";
import { PRIVATE_KEY } from "$env/static/private";
import { logger } from "../pino/logger";
import { db } from "../sqlite/db";
import type { UserSelect } from "../sqlite/tables";
import { err, ok } from "neverthrow";
import { attempt } from "$lib/util/attempt";
import { errorToString, type NeverThrowError } from "$lib/util/neverThrow";

export async function authenticateUser(token: string) {
  const verified = attempt(() => jwt.verify(token, PRIVATE_KEY));
  if (verified.error) {
    return err({
      reason: "TOKEN_VERIFY_FAILED",
      cause: errorToString(verified.error),
    } as const satisfies NeverThrowError);
  }

  const jwtUser = verified.data as UserSelect;
  const user = await attempt(() =>
    db.query.users.findFirst({
      where: {
        id: jwtUser.id,
      },
      with: {
        permissions: true,
      },
    }),
  );
  if (user.error) {
    logger.error(user.error);
    return err({
      reason: "USER_LOOKUP_FAILED",
      cause: errorToString(user.error),
    } as const satisfies NeverThrowError);
  }

  if (!user.data) {
    return err({
      reason: "USER_NOT_FOUND",
      cause: `[auth] authenticateUser() no user found for id ${jwtUser.id}`,
    } as const satisfies NeverThrowError);
  }

  return ok(user.data);
}
