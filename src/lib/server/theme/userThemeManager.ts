import { and, eq, isNull, ne } from "drizzle-orm";
import { err, ok } from "neverthrow";
import { db } from "$lib/server/sqlite/db";
import { logger } from "$lib/server/pino/logger";
import { projects, user_theme, type UserThemeSelect } from "$lib/sqlite/tables";
import { DEFAULT_THEME_CSS, DEFAULT_THEME_NAME } from "$lib/themes/defaultThemeCss";
import { enforceThemeCss } from "$lib/themes/css";
import { attempt } from "$lib/util/attempt";
import { errorToString, type NeverThrowError } from "$lib/util/neverThrow";
import { newId } from "$lib/util/newId";

export const themeNamePattern = /^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/;

function dbError(error: unknown, cause: string) {
  return err({
    reason: "DB_ERROR",
    cause: `${cause}: ${errorToString(error)}`,
  } as const satisfies NeverThrowError);
}

function invalidName(name: string) {
  return err({
    reason: "INVALID_THEME_NAME",
    cause: `theme name "${name}" must start with a letter or number and contain only letters, numbers, spaces, underscores, and hyphens`,
  } as const satisfies NeverThrowError);
}

export type UserThemeInput = {
  id?: string;
  name: string;
  projectStyle: string;
};

export class UserThemeManager {
  getAll() {
    const result = attempt(() => db.select().from(user_theme).all());
    if (result.isErr) return dbError(result.error, "getAll() failed");
    return ok(result.data);
  }

  get(id: string) {
    const result = attempt(() =>
      db.select().from(user_theme).where(eq(user_theme.id, id)).get(),
    );
    if (result.isErr) return dbError(result.error, "get() failed");
    if (!result.data) {
      return err({
        reason: "THEME_NOT_FOUND",
        cause: `theme ${id} does not exist`,
      } as const satisfies NeverThrowError);
    }
    return ok(result.data);
  }

  getDefault() {
    const all = this.getAll();
    if (all.isErr()) return err(all.error);
    return ok(all.value.find((theme) => theme.name === DEFAULT_THEME_NAME) ?? all.value[0] ?? null);
  }

  ensureDefault() {
    const all = this.getAll();
    if (all.isErr()) return err(all.error);

    let defaultTheme =
      all.value.find((theme) => theme.name === DEFAULT_THEME_NAME) ?? all.value[0];
    if (!defaultTheme) {
      const created = this.create({
        name: DEFAULT_THEME_NAME,
        projectStyle: DEFAULT_THEME_CSS,
      });
      if (created.isErr()) return err(created.error);
      defaultTheme = created.value;
    }

    const assigned = attempt(() =>
      db
        .update(projects)
        .set({ themeId: defaultTheme.id, updatedAt: Date.now() })
        .where(isNull(projects.themeId))
        .run(),
    );
    if (assigned.isErr) return dbError(assigned.error, "ensureDefault() project assignment failed");

    return ok(defaultTheme);
  }

  create(input: UserThemeInput) {
    const name = input.name.trim();
    if (!themeNamePattern.test(name)) return invalidName(name);

    const existing = attempt(() =>
      db.select({ id: user_theme.id }).from(user_theme).where(eq(user_theme.name, name)).get(),
    );
    if (existing.isErr) return dbError(existing.error, "create() name lookup failed");
    if (existing.data) {
      return err({
        reason: "DUPLICATE_THEME_NAME",
        cause: `a theme named "${name}" already exists`,
      } as const satisfies NeverThrowError);
    }

    const now = Date.now();
    const id = input.id ?? newId();
    const projectStyle = enforceThemeCss(name, input.projectStyle);
    const inserted = attempt(() =>
      db
        .insert(user_theme)
        .values({
          id,
          name,
          projectStyle,
          createdAt: now,
          updatedAt: now,
        })
        .run(),
    );
    if (inserted.isErr) return dbError(inserted.error, "create() insert failed");

    logger.info(`[UserThemeManager] created theme ${id}`);
    return this.get(id);
  }

  replace(id: string, input: Omit<UserThemeInput, "id">) {
    const name = input.name.trim();
    if (!themeNamePattern.test(name)) return invalidName(name);

    const theme = this.get(id);
    if (theme.isErr()) return err(theme.error);

    const duplicate = attempt(() =>
      db
        .select({ id: user_theme.id })
        .from(user_theme)
        .where(and(eq(user_theme.name, name), ne(user_theme.id, id)))
        .get(),
    );
    if (duplicate.isErr) return dbError(duplicate.error, "replace() name lookup failed");
    if (duplicate.data) {
      return err({
        reason: "DUPLICATE_THEME_NAME",
        cause: `a theme named "${name}" already exists`,
      } as const satisfies NeverThrowError);
    }

    const projectStyle = enforceThemeCss(name, input.projectStyle);
    const updated = attempt(() =>
      db
        .update(user_theme)
        .set({
          name,
          projectStyle,
          updatedAt: Date.now(),
        })
        .where(eq(user_theme.id, id))
        .run(),
    );
    if (updated.isErr) return dbError(updated.error, "replace() update failed");

    return this.get(id);
  }

  delete(id: string) {
    const theme = this.get(id);
    if (theme.isErr()) return err(theme.error);

    const deleted = attempt(() => db.delete(user_theme).where(eq(user_theme.id, id)).run());
    if (deleted.isErr) return dbError(deleted.error, "delete() failed");

    logger.info(`[UserThemeManager] deleted theme ${id}`);
    return ok({ id });
  }

  setProjectTheme(projectId: string, themeId: string | null) {
    if (themeId !== null) {
      const theme = this.get(themeId);
      if (theme.isErr()) return err(theme.error);
    }

    const updated = attempt(() =>
      db
        .update(projects)
        .set({ themeId, updatedAt: Date.now() })
        .where(eq(projects.id, projectId))
        .returning()
        .get(),
    );
    if (updated.isErr) return dbError(updated.error, "setProjectTheme() update failed");
    if (!updated.data) {
      return err({
        reason: "PROJECT_NOT_FOUND",
        cause: `project ${projectId} does not exist`,
      } as const satisfies NeverThrowError);
    }

    return ok(updated.data);
  }

}

export const userThemeManager = new UserThemeManager();
