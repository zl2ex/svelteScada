import { command, form, getRequestEvent, prerender, query } from "$app/server";

import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

import { db } from "$lib/server/sqlite/db";
import { z_insertUser } from "$lib/server/sqlite/tables";
import { error, invalid, redirect } from "@sveltejs/kit";
import { err } from "neverthrow";
import { attempt } from "$lib/util/attempt";
import { errorToString, type NeverThrowError } from "$lib/util/neverThrow";

import { JWT_EXPERATION_TIME, PRIVATE_KEY } from "$env/static/private";
import { z_loginUser } from "$lib/server/sqlite/tables/users";
import { tables } from "$lib/server/sqlite/tables";

export const register = form(z_insertUser, async (newUser, issue) => {
  const { cookies } = getRequestEvent();
  cookies.delete("token", { path: "/" });

  const found = await attempt(() =>
    db.query.users.findFirst({
      where: {
        email: newUser.email,
      },
    }),
  );
  if (found.error) {
    const failure = err({
      reason: "USER_LOOKUP_FAILED",
      cause: `[user.remote.ts] register() user lookup failed: ${errorToString(
        found.error,
      )}`,
    } as const satisfies NeverThrowError);
    error(500, `${failure.error.reason}: ${failure.error.cause}`);
  }

  if (found.data)
    return invalid(issue.email("user already exists with that email"));

  const salt = await attempt(() => bcrypt.genSalt(10));
  if (salt.error) {
    const failure = err({
      reason: "BCRYPT_SALT_FAILED",
      cause: `[user.remote.ts] register() bcrypt.genSalt() failed: ${errorToString(
        salt.error,
      )}`,
    } as const satisfies NeverThrowError);
    error(500, `${failure.error.reason}: ${failure.error.cause}`);
  }

  const hashedPassword = await attempt(() =>
    bcrypt.hash(newUser.password, salt.data),
  );
  if (hashedPassword.error) {
    const failure = err({
      reason: "BCRYPT_HASH_FAILED",
      cause: `[user.remote.ts] register() bcrypt.hash() failed: ${errorToString(
        hashedPassword.error,
      )}`,
    } as const satisfies NeverThrowError);
    error(500, `${failure.error.reason}: ${failure.error.cause}`);
  }
  newUser.password = hashedPassword.data;

  const inserted = await attempt(() =>
    db.insert(tables.users).values(newUser).returning(),
  );
  if (inserted.error) {
    const failure = err({
      reason: "USER_INSERT_FAILED",
      cause: `[user.remote.ts] register() failed to insert user: ${errorToString(
        inserted.error,
      )}`,
    } as const satisfies NeverThrowError);
    error(500, `${failure.error.reason}: ${failure.error.cause}`);
  }
  const [insertedUser] = inserted.data;

  const permission = attempt(() =>
    db
      .insert(tables.user_permissions)
      .values({ userId: insertedUser.id })
      .run(),
  );
  if (permission.error) {
    const failure = err({
      reason: "USER_PERMISSION_INSERT_FAILED",
      cause: `[user.remote.ts] register() failed to insert user permission: ${errorToString(
        permission.error,
      )}`,
    } as const satisfies NeverThrowError);
    error(500, `${failure.error.reason}: ${failure.error.cause}`);
  }

  redirect(302, "/login");
});

export const login = form(z_loginUser, async (loginUser, issue) => {
  const { cookies, url } = getRequestEvent();

  const found = await attempt(() =>
    db.query.users.findFirst({
      where: {
        email: loginUser.email,
      },
    }),
  );
  if (found.error) {
    const failure = err({
      reason: "USER_LOOKUP_FAILED",
      cause: `[user.remote.ts] login() user lookup failed: ${errorToString(
        found.error,
      )}`,
    } as const satisfies NeverThrowError);
    error(500, `${failure.error.reason}: ${failure.error.cause}`);
  }

  const user = found.data;
  if (!user) return invalid(issue("invalid credentails"));

  const passwordCorrect = await attempt(() =>
    bcrypt.compare(loginUser.password, user.password),
  );
  if (passwordCorrect.error) {
    const failure = err({
      reason: "BCRYPT_COMPARE_FAILED",
      cause: `[user.remote.ts] login() bcrypt.compare() failed: ${errorToString(
        passwordCorrect.error,
      )}`,
    } as const satisfies NeverThrowError);
    error(500, `${failure.error.reason}: ${failure.error.cause}`);
  }

  if (!passwordCorrect.data) return invalid(issue("invalid credentails"));

  const token = attempt(() =>
    jwt.sign({ id: user.id }, PRIVATE_KEY, {
      algorithm: "RS256",
      expiresIn: JWT_EXPERATION_TIME,
    } as jwt.SignOptions),
  );
  if (token.error) {
    const failure = err({
      reason: "JWT_SIGN_FAILED",
      cause: `[user.remote.ts] login() jwt.sign() failed: ${errorToString(
        token.error,
      )}`,
    } as const satisfies NeverThrowError);
    error(500, `${failure.error.reason}: ${failure.error.cause}`);
  }

  // Set the cookie
  cookies.set("token", token.data, {
    httpOnly: true,
    path: "/",
    secure: false, // WIP DEV ONLY FOR HOSTING -- change to true for production
    sameSite: "strict",
    maxAge: 60 * 60 * 24 * 360, // 1 Year
  });

  return redirect(302, url.searchParams.get("redirect") ?? "/");
});

export const logout = command(() => {
  const { cookies } = getRequestEvent();

  cookies.delete("token", { path: "/" });
});
