import jwt from "jsonwebtoken";
import { PRIVATE_KEY } from "$env/static/private";
import { logger } from "../pino/logger";
import { db } from "../sqlite/db";
import { eq } from "drizzle-orm";
import type { UserSelect } from "../sqlite/tables";

export async function authenticateUser(token: string) {
  try {
    const jwtUser = jwt.verify(token, PRIVATE_KEY) as UserSelect;
    logger.debug(jwtUser, "[Auth] jwtUser ");

    const user = await db.query.users.findFirst({
      where: {
        id: jwtUser.id,
      },
      with: {
        permissions: true,
      },
    });

    return user;
  } catch (err) {
    logger.error(err);
    logger.debug(token);
  }

  return undefined;
}
