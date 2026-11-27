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

/**
 * Wraps a database failure in the standard DB_ERROR result.
 *
 * @param error - the thrown database error to stringify
 * @param cause - context describing which operation failed
 * @returns an err Result carrying the DB_ERROR reason
 */
function dbError(error: unknown, cause: string) {
  return err({
    reason: "DB_ERROR",
    cause: `${cause}: ${errorToString(error)}`,
  } as const satisfies NeverThrowError);
}

/**
 * Builds the invalid theme name error result.
 *
 * @param name - the rejected theme name
 * @returns an err Result carrying the INVALID_THEME_NAME reason
 */
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
  /**
   * Lists every stored theme.
   *
   * @returns ok with all theme rows, or err on database failure
   */
  getAll() {
    const result = attempt(() => db.select().from(user_theme).all());
    if (result.isErr) return dbError(result.error, "getAll() failed");
    return ok(result.data);
  }

  /**
   * Fetches a single theme by id.
   *
   * @param id - the theme id to fetch
   * @returns ok with the theme row, or err when missing or on database failure
   */
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

  /**
   * Returns the named default theme, else the first stored theme, else null.
   *
   * @returns ok with the default theme or null, or err on database failure
   */
  getDefault() {
    const all = this.getAll();
    if (all.isErr()) return err(all.error);
    return ok(all.value.find((theme) => theme.name === DEFAULT_THEME_NAME) ?? all.value[0] ?? null);
  }

  /**
   * Ensures a default theme exists and assigns it to projects lacking a theme.
   *
   * @returns ok with the default theme, or err on database failure
   */
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

  /**
   * Validates and inserts a new theme with normalized CSS.
   *
   * @param input - the optional id, name, and project CSS for the theme
   * @returns ok with the created theme, or err on validation or database failure
   */
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

  /**
   * Replaces a theme's name and CSS after validating uniqueness.
   *
   * @param id - the id of the theme to replace
   * @param input - the new name and project CSS
   * @returns ok with the updated theme, or err on validation or database failure
   */
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

  /**
   * Deletes a theme by id.
   *
   * @param id - the id of the theme to delete
   * @returns ok with the deleted theme id, or err when missing or on database failure
   */
  delete(id: string) {
    const theme = this.get(id);
    if (theme.isErr()) return err(theme.error);

    const deleted = attempt(() => db.delete(user_theme).where(eq(user_theme.id, id)).run());
    if (deleted.isErr) return dbError(deleted.error, "delete() failed");

    logger.info(`[UserThemeManager] deleted theme ${id}`);
    return ok({ id });
  }

}

export const userThemeManager = new UserThemeManager();
