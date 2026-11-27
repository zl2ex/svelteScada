import { eq } from "drizzle-orm";
import { err, ok } from "neverthrow";
import { db } from "$lib/server/sqlite/db";
import { projects, z_ProjectInsert, type ProjectSelect } from "$lib/sqlite/tables";
import { attempt } from "$lib/util/attempt";
import { errorToString, type NeverThrowError } from "$lib/util/neverThrow";

export class ProjectManager {
  /**
   * Lists every project in the database.
   *
   * @returns ok with all project rows, or err on database failure
   */
  getAll() {
    const result = attempt(() => db.select().from(projects).all());
    if (result.isErr) {
      return err({
        reason: "DB_ERROR",
        cause: `getAll() failed: ${errorToString(result.error)}`,
      } as const satisfies NeverThrowError);
    }
    return ok(result.data);
  }

  /**
   * Fetches a single project by id.
   *
   * @param id - the project id to fetch
   * @returns ok with the project row, or err when missing or on database failure
   */
  getById(id: string) {
    const result = attempt(() =>
      db.select().from(projects).where(eq(projects.id, id)).get(),
    );
    if (result.isErr) {
      return err({
        reason: "DB_ERROR",
        cause: `getById() failed: ${errorToString(result.error)}`,
      } as const satisfies NeverThrowError);
    }
    if (!result.data) {
      return err({
        reason: "PROJECT_NOT_FOUND",
        cause: `project ${id} does not exist`,
      } as const satisfies NeverThrowError);
    }
    return ok(result.data);
  }

  /**
   * Fetches a single project by its unique name.
   *
   * @param name - the project name to fetch
   * @returns ok with the project row, or err when missing or on database failure
   */
  getByName(name: string) {
    const result = attempt(() =>
      db.select().from(projects).where(eq(projects.name, name)).get(),
    );
    if (result.isErr) {
      return err({
        reason: "DB_ERROR",
        cause: `getByName() failed: ${errorToString(result.error)}`,
      } as const satisfies NeverThrowError);
    }
    if (!result.data) {
      return err({
        reason: "PROJECT_NOT_FOUND",
        cause: `project ${name} does not exist`,
      } as const satisfies NeverThrowError);
    }
    return ok(result.data);
  }

  /**
   * Validates and inserts a new project.
   *
   * @param value - the project fields to insert, including its id
   * @returns ok with the created project, or err on validation or database failure
   */
  create(value: ProjectSelect) {
    const parsed = z_ProjectInsert.safeParse(value);
    if (!parsed.success) {
      return err({
        reason: "INVALID_PROJECT",
        cause: parsed.error.message,
      } as const satisfies NeverThrowError);
    }

    const now = Date.now();
    const inserted = attempt(() =>
      db
        .insert(projects)
        .values({
          ...parsed.data,
          id: value.id,
          createdAt: now,
          updatedAt: now,
        })
        .run(),
    );
    if (inserted.isErr) {
      return err({
        reason: "DB_ERROR",
        cause: `create() insert failed: ${errorToString(inserted.error)}`,
      } as const satisfies NeverThrowError);
    }

    return this.getById(value.id);
  }

  /**
   * Validates and updates an existing project's editable fields.
   *
   * @param id - the id of the project to replace
   * @param value - the new project values
   * @returns ok with the updated project, or err on validation or database failure
   */
  replace(id: string, value: ProjectSelect) {
    const parsed = z_ProjectInsert.safeParse(value);
    if (!parsed.success) {
      return err({
        reason: "INVALID_PROJECT",
        cause: parsed.error.message,
      } as const satisfies NeverThrowError);
    }

    const existing = this.getById(id);
    if (existing.isErr()) return err(existing.error);

    const updated = attempt(() =>
      db
        .update(projects)
        .set({
          name: parsed.data.name,
          version: parsed.data.version,
          description: parsed.data.description ?? null,
          themeId: parsed.data.themeId ?? null,
          grid_enabled: parsed.data.grid_enabled,
          grid_spacing: parsed.data.grid_spacing,
          updatedAt: Date.now(),
        })
        .where(eq(projects.id, id))
        .run(),
    );
    if (updated.isErr) {
      return err({
        reason: "DB_ERROR",
        cause: `replace() update failed: ${errorToString(updated.error)}`,
      } as const satisfies NeverThrowError);
    }

    return this.getById(id);
  }

  /**
   * Deletes a project by id.
   *
   * @param id - the id of the project to delete
   * @returns ok with the deleted project id, or err when missing or on database failure
   */
  delete(id: string) {
    const existing = this.getById(id);
    if (existing.isErr()) return err(existing.error);

    const deleted = attempt(() => db.delete(projects).where(eq(projects.id, id)).run());
    if (deleted.isErr) {
      return err({
        reason: "DB_ERROR",
        cause: `delete() failed: ${errorToString(deleted.error)}`,
      } as const satisfies NeverThrowError);
    }

    return ok({ id });
  }
}

export const projectManager = new ProjectManager();
