import { command, form, getRequestEvent, prerender, query } from "$app/server";

import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

import { db } from "$lib/server/sqlite/db";
import { z_insertUser } from "$lib/server/sqlite/tables";
import { invalid, redirect } from "@sveltejs/kit";

import { JWT_EXPERATION_TIME, PRIVATE_KEY } from "$env/static/private";
import { z_loginUser } from "$lib/server/sqlite/tables/user";
import { tables } from "$lib/server/sqlite/tables";

export const register = form(z_insertUser, async (newUser, issue) => {
  const { cookies } = getRequestEvent();
  cookies.delete("token", { path: "/" });
  const user = await db.query.user.findFirst({
    where: {
      email: newUser.email,
    },
  });

  if (user) return invalid(issue.email("user already exists with that email"));

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(newUser.password, salt);
  newUser.password = hashedPassword;

  db.insert(tables.user).values(newUser).run();
  redirect(302, "/login");
});

export const login = form(z_loginUser, async (loginUser, issue) => {
  const { cookies, url } = getRequestEvent();

  const user = await db.query.user.findFirst({
    where: {
      id: loginUser.id,
    },
  });

  if (!user) return invalid(issue("invalid credentails"));

  let passwordCorrect = await bcrypt.compare(loginUser.password, user.password);
  if (!passwordCorrect) return invalid(issue("invalid credentails"));

  const token = jwt.sign({ id: user.id }, PRIVATE_KEY, {
    algorithm: "RS256",
    expiresIn: JWT_EXPERATION_TIME,
  } as jwt.SignOptions);

  // Set the cookie
  cookies.set("token", token, {
    httpOnly: true,
    path: "/",
    secure: true, // WIP DEV ONLY FOR HOSTING -- change to true for production
    sameSite: "strict",
    maxAge: 60 * 60 * 24 * 360, // 1 Year
  });

  return redirect(302, url.searchParams.get("redirect") ?? "/");
});

export const logout = command(() => {
  const { cookies } = getRequestEvent();

  cookies.delete("token", { path: "/" });
});
