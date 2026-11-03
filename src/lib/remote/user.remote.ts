import { command, form, getRequestEvent, query } from "$app/server";

import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import z from "zod";

import { db } from "$lib/server/sqlite/db";
import { z_UserLogin } from "$lib/sqlite/tables/users";
import { tables } from "$lib/sqlite/tables";
import { error, invalid, redirect } from "@sveltejs/kit";
import { err } from "neverthrow";
import { attempt } from "$lib/util/attempt";
import { errorToString, type NeverThrowError } from "$lib/util/neverThrow";
import { permissionActions, permissionSubjects, userRoles } from "$lib/permissions/constants";
import { assertCan } from "$lib/server/auth/authorize";

import { JWT_EXPERATION_TIME, PRIVATE_KEY } from "$env/static/private";

const z_AdminCreateUser = z.object({
  name: z.string().min(1).max(80),
  email: z.email(),
  password: z.string().min(8),
  role: z.enum(userRoles),
});

const z_UpdateUserRole = z.object({
  userId: z.string().min(1),
  role: z.enum(userRoles),
});

const z_DeleteUser = z.object({
  userId: z.string().min(1),
});

const z_PermissionRuleInput = z.object({
  action: z.enum(permissionActions),
  subject: z.enum(permissionSubjects),
  conditions: z.record(z.string(), z.unknown()).nullable().optional(),
  fields: z.array(z.string()).nullable().optional(),
  inverted: z.boolean().optional().default(false),
  reason: z.string().nullable().optional(),
});

const z_SetUserPermissions = z.object({
  userId: z.string().min(1),
  rules: z.array(z_PermissionRuleInput),
});

async function adminCount() {
  const admins = await attempt(() =>
    db
      .select({ id: tables.users.id })
      .from(tables.users)
      .where(eq(tables.users.role, "admin"))
      .all(),
  );
  if (admins.isErr) {
    error(500, `[user.remote.ts] adminCount() ${errorToString(admins.error)}`);
  }
  return admins.data.length;
}

export const listUsers = query(async () => {
  const { locals } = getRequestEvent();
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
    error(500, `[user.remote.ts] listUsers() ${errorToString(users.error)}`);
  }

  return users.data;
});

export const createUser = command(z_AdminCreateUser, async (input) => {
  const { locals } = getRequestEvent();
  assertCan(locals.ability, "manage", "User");

  const found = await attempt(() =>
    db.query.users.findFirst({
      where: {
        email: input.email,
      },
    }),
  );
  if (found.isErr) {
    error(500, `[user.remote.ts] createUser() lookup ${errorToString(found.error)}`);
  }
  if (found.data) {
    error(409, "A user already exists with that email");
  }

  const salt = await attempt(() => bcrypt.genSalt(10));
  if (salt.isErr) {
    error(500, `[user.remote.ts] createUser() bcrypt.genSalt() ${errorToString(salt.error)}`);
  }

  const hashedPassword = await attempt(() => bcrypt.hash(input.password, salt.data));
  if (hashedPassword.isErr) {
    error(
      500,
      `[user.remote.ts] createUser() bcrypt.hash() ${errorToString(hashedPassword.error)}`,
    );
  }

  const inserted = await attempt(() =>
    db
      .insert(tables.users)
      .values({
        name: input.name,
        email: input.email,
        password: hashedPassword.data,
        role: input.role,
      })
      .returning({
        id: tables.users.id,
        name: tables.users.name,
        email: tables.users.email,
        role: tables.users.role,
      }),
  );
  if (inserted.isErr) {
    error(500, `[user.remote.ts] createUser() insert ${errorToString(inserted.error)}`);
  }

  return inserted.data[0];
});

export const updateUserRole = command(z_UpdateUserRole, async (input) => {
  const { locals } = getRequestEvent();
  assertCan(locals.ability, "manage", "User");

  const target = await attempt(() =>
    db.query.users.findFirst({
      where: {
        id: input.userId,
      },
    }),
  );
  if (target.isErr) {
    error(500, `[user.remote.ts] updateUserRole() lookup ${errorToString(target.error)}`);
  }
  if (!target.data) {
    error(404, "User not found");
  }

  if (target.data.role === "admin" && input.role !== "admin") {
    if ((await adminCount()) <= 1) {
      error(400, "Cannot demote the last admin");
    }
    if (locals.user?.id === input.userId) {
      error(400, "You cannot demote your own admin account");
    }
  }

  const updated = await attempt(() =>
    db
      .update(tables.users)
      .set({ role: input.role })
      .where(eq(tables.users.id, input.userId))
      .returning({
        id: tables.users.id,
        role: tables.users.role,
      }),
  );
  if (updated.isErr) {
    error(500, `[user.remote.ts] updateUserRole() update ${errorToString(updated.error)}`);
  }

  return updated.data[0];
});

export const deleteUser = command(z_DeleteUser, async (input) => {
  const { locals } = getRequestEvent();
  assertCan(locals.ability, "manage", "User");

  if (locals.user?.id === input.userId) {
    error(400, "You cannot delete your own account");
  }

  const target = await attempt(() =>
    db.query.users.findFirst({
      where: {
        id: input.userId,
      },
    }),
  );
  if (target.isErr) {
    error(500, `[user.remote.ts] deleteUser() lookup ${errorToString(target.error)}`);
  }
  if (!target.data) {
    error(404, "User not found");
  }
  if (target.data.role === "admin" && (await adminCount()) <= 1) {
    error(400, "Cannot delete the last admin");
  }

  const deleted = await attempt(() =>
    db.delete(tables.users).where(eq(tables.users.id, input.userId)).run(),
  );
  if (deleted.isErr) {
    error(500, `[user.remote.ts] deleteUser() ${errorToString(deleted.error)}`);
  }

  return { success: true as const };
});

export const setUserPermissions = command(z_SetUserPermissions, async (input) => {
  const { locals } = getRequestEvent();
  assertCan(locals.ability, "manage", "User");

  const user = await attempt(() =>
    db.query.users.findFirst({
      where: {
        id: input.userId,
      },
    }),
  );
  if (user.isErr) {
    error(500, `[user.remote.ts] setUserPermissions() lookup ${errorToString(user.error)}`);
  }
  if (!user.data) {
    error(404, "User not found");
  }

  const replaced = attempt(() =>
    db.transaction((tx) => {
      tx.delete(tables.user_permissions)
        .where(eq(tables.user_permissions.userId, input.userId))
        .run();

      if (input.rules.length > 0) {
        tx.insert(tables.user_permissions)
          .values(
            input.rules.map((rule) => ({
              userId: input.userId,
              action: rule.action,
              subject: rule.subject,
              conditions: rule.conditions ?? null,
              fields: rule.fields ?? null,
              inverted: rule.inverted ?? false,
              reason: rule.reason ?? null,
            })),
          )
          .run();
      }
    }),
  );
  if (replaced.isErr) {
    error(500, `[user.remote.ts] setUserPermissions() ${errorToString(replaced.error)}`);
  }

  return { success: true as const };
});

export const login = form(z_UserLogin, async (loginUser, issue) => {
  const { cookies, url } = getRequestEvent();

  const found = await attempt(() =>
    db.query.users.findFirst({
      where: {
        email: loginUser.email,
      },
    }),
  );
  if (found.isErr) {
    const failure = err({
      reason: "USER_LOOKUP_FAILED",
      cause: `[user.remote.ts] login() user lookup failed: ${errorToString(found.error)}`,
    } as const satisfies NeverThrowError);
    error(500, `${failure.error.reason}: ${failure.error.cause}`);
  }

  const user = found.data;
  if (!user) return invalid(issue("invalid credentails"));

  const passwordCorrect = await attempt(() => bcrypt.compare(loginUser.password, user.password));
  if (passwordCorrect.isErr) {
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
  if (token.isErr) {
    const failure = err({
      reason: "JWT_SIGN_FAILED",
      cause: `[user.remote.ts] login() jwt.sign() failed: ${errorToString(token.error)}`,
    } as const satisfies NeverThrowError);
    error(500, `${failure.error.reason}: ${failure.error.cause}`);
  }

  cookies.set("token", token.data, {
    httpOnly: true,
    path: "/",
    secure: false, // WIP DEV ONLY FOR HOSTING -- change to true for production
    sameSite: "strict",
    maxAge: 60 * 60 * 24 * 360,
  });

  return redirect(302, url.searchParams.get("redirect") ?? "/");
});

export const logout = command(() => {
  const { cookies } = getRequestEvent();

  cookies.delete("token", { path: "/" });
});
