import { and, eq, ne } from "drizzle-orm";
import { err, ok } from "neverthrow";
import { db } from "$lib/server/sqlite/db";
import { logger } from "$lib/server/pino/logger";
import { pages, projects } from "$lib/sqlite/tables";
import { isValidRouteSegment } from "$lib/elements/elementTypes";
import type { PageRecord } from "$lib/elements/pageTypes";
import { attempt } from "$lib/util/attempt";
import { errorToString, type NeverThrowError } from "$lib/util/neverThrow";
import { newId } from "$lib/util/newId";

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

export type CreatePageInput = {
  id?: string;
  projectId: string;
  name: string;
  sortIndex?: number;
};

export class PageManager {
  /**
   * Lists every page in the database.
   *
   * @returns ok with all page rows, or err on database failure
   */
  getAll() {
    const result = attempt(() => db.select().from(pages).all());
    if (result.isErr) return dbError(result.error, "getAll() failed");
    return ok(result.data);
  }

  /**
   * Lists all pages belonging to a project.
   *
   * @param projectId - the project whose pages to list
   * @returns ok with the project's page rows, or err on database failure
   */
  getAllForProject(projectId: string) {
    const result = attempt(() =>
      db.select().from(pages).where(eq(pages.projectId, projectId)).all(),
    );
    if (result.isErr) return dbError(result.error, "getAllForProject() failed");
    return ok(result.data);
  }

  /**
   * Fetches a single page by id.
   *
   * @param id - the page id to fetch
   * @returns ok with the page row, or err when it is missing or the query fails
   */
  get(id: string) {
    const result = attempt(() => db.select().from(pages).where(eq(pages.id, id)).get());
    if (result.isErr) return dbError(result.error, "get() failed");
    if (!result.data) {
      return err({
        reason: "PAGE_NOT_FOUND",
        cause: `page ${id} does not exist`,
      } as const satisfies NeverThrowError);
    }
    return ok(result.data);
  }

  /**
   * Creates a page after validating its project, route-safe name, and sort index.
   *
   * @param input - the page id, project id, name, and optional sort index
   * @returns ok with the created page, or err on validation or database failure
   */
  create(input: CreatePageInput) {
    if (!isValidRouteSegment(input.name)) {
      return err({
        reason: "INVALID_PAGE_NAME",
        cause: "page names must be lowercase letters, numbers, and hyphens",
      } as const satisfies NeverThrowError);
    }

    const project = attempt(() =>
      db.select().from(projects).where(eq(projects.id, input.projectId)).get(),
    );
    if (project.isErr) return dbError(project.error, "create() project lookup failed");
    if (!project.data) {
      return err({
        reason: "PROJECT_NOT_FOUND",
        cause: `project ${input.projectId} does not exist`,
      } as const satisfies NeverThrowError);
    }

    const nameError = this.#checkName(input.projectId, input.name);
    if (nameError.isErr()) return err(nameError.error);

    const siblings = this.getAllForProject(input.projectId);
    if (siblings.isErr()) return err(siblings.error);
    const sortIndex =
      input.sortIndex ?? Math.max(-1, ...siblings.value.map((page) => page.sortIndex)) + 1;
    if (!Number.isInteger(sortIndex) || sortIndex < 0) {
      return err({
        reason: "INVALID_SORT_INDEX",
        cause: "sortIndex must be a non-negative integer",
      } as const satisfies NeverThrowError);
    }

    const now = Date.now();
    const id = input.id ?? newId();
    const inserted = attempt(() =>
      db
        .insert(pages)
        .values({
          id,
          projectId: input.projectId,
          name: input.name,
          sortIndex,
          createdAt: now,
          updatedAt: now,
        })
        .run(),
    );
    if (inserted.isErr) return dbError(inserted.error, "create() insert failed");

    logger.info(`[PageManager] created page ${id}`);
    return this.get(id);
  }

  /**
   * Replaces a page's name and sort index after validation.
   *
   * @param id - the id of the page to replace
   * @param input - the new name and sort index
   * @returns ok with the updated page, or err on validation or database failure
   */
  replace(
    id: string,
    input: {
      name: string;
      sortIndex: number;
        },
  ) {
    if (!isValidRouteSegment(input.name)) {
      return err({
        reason: "INVALID_PAGE_NAME",
        cause: "page names must be lowercase letters, numbers, and hyphens",
      } as const satisfies NeverThrowError);
    }
    if (!Number.isInteger(input.sortIndex) || input.sortIndex < 0) {
      return err({
        reason: "INVALID_SORT_INDEX",
        cause: "sortIndex must be a non-negative integer",
      } as const satisfies NeverThrowError);
    }

    const page = this.get(id);
    if (page.isErr()) return err(page.error);

    const nameError = this.#checkName(page.value.projectId, input.name, id);
    if (nameError.isErr()) return err(nameError.error);

    const updated = attempt(() =>
      db
        .update(pages)
        .set({
          name: input.name,
          sortIndex: input.sortIndex,
          updatedAt: Date.now(),
        })
        .where(eq(pages.id, id))
        .run(),
    );
    if (updated.isErr) return dbError(updated.error, "replace() failed");

    return this.get(id);
  }

  /**
   * Renames a page after validating the new route-safe name is unique.
   *
   * @param id - the id of the page to rename
   * @param name - the new page name
   * @returns ok with the updated page, or err on validation or database failure
   */
  rename(id: string, name: string) {
    if (!isValidRouteSegment(name)) {
      return err({
        reason: "INVALID_PAGE_NAME",
        cause: "page names must be lowercase letters, numbers, and hyphens",
      } as const satisfies NeverThrowError);
    }

    const page = this.get(id);
    if (page.isErr()) return err(page.error);

    const nameError = this.#checkName(page.value.projectId, name, id);
    if (nameError.isErr()) return err(nameError.error);

    const updated = attempt(() =>
      db.update(pages).set({ name, updatedAt: Date.now() }).where(eq(pages.id, id)).run(),
    );
    if (updated.isErr) return dbError(updated.error, "rename() failed");

    logger.info(`[PageManager] renamed page ${id}`);
    return this.get(id);
  }

  /**
   * Updates a page's sort index.
   *
   * @param id - the id of the page to reorder
   * @param sortIndex - the new non-negative integer position
   * @returns ok with the updated page, or err on validation or database failure
   */
  reorder(id: string, sortIndex: number) {
    const page = this.get(id);
    if (page.isErr()) return err(page.error);
    if (!Number.isInteger(sortIndex) || sortIndex < 0) {
      return err({
        reason: "INVALID_SORT_INDEX",
        cause: "sortIndex must be a non-negative integer",
      } as const satisfies NeverThrowError);
    }

    const updated = attempt(() =>
      db.update(pages).set({ sortIndex, updatedAt: Date.now() }).where(eq(pages.id, id)).run(),
    );
    if (updated.isErr) return dbError(updated.error, "reorder() failed");

    return this.get(id);
  }

  /**
   * Deletes a page by id.
   *
   * @param id - the id of the page to delete
   * @returns ok with the deleted page id, or err when missing or on database failure
   */
  delete(id: string) {
    const page = this.get(id);
    if (page.isErr()) return err(page.error);

    const deleted = attempt(() => db.delete(pages).where(eq(pages.id, id)).run());
    if (deleted.isErr) return dbError(deleted.error, "delete() failed");

    logger.info(`[PageManager] deleted page ${id}`);
    return ok({ id });
  }

  /**
   * Builds the URL path for a page within a project.
   *
   * @param projectName - the project's route name
   * @param page - the page whose name supplies the last segment
   * @returns the route path, for example `/project/page-name`
   */
  getRoute(projectName: string, page: PageRecord) {
    return `/${projectName}/${page.name}`;
  }

  /**
   * Checks that a page name is not already used within a project.
   *
   * @param projectId - the project scope for the name check
   * @param name - the candidate page name
   * @param excludeId - optional page id to ignore, for renames
   * @returns ok with null when unique, or err when duplicated or the query fails
   */
  #checkName(projectId: string, name: string, excludeId?: string) {
    const result = attempt(() =>
      db
        .select({ id: pages.id })
        .from(pages)
        .where(
          and(
            eq(pages.projectId, projectId),
            eq(pages.name, name),
            ...(excludeId ? [ne(pages.id, excludeId)] : []),
          ),
        )
        .get(),
    );
    if (result.isErr) return dbError(result.error, "checkName() failed");
    if (result.data) {
      return err({
        reason: "DUPLICATE_PAGE_NAME",
        cause: `a page named "${name}" already exists in this project`,
      } as const satisfies NeverThrowError);
    }
    return ok(null);
  }
}

export const pageManager = new PageManager();
