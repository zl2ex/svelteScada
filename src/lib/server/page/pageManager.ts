import { and, eq, ne } from "drizzle-orm";
import { err, ok } from "neverthrow";
import { db } from "$lib/server/sqlite/db";
import { logger } from "$lib/server/pino/logger";
import { pages, projects } from "$lib/sqlite/tables";
import type { ContainerType } from "$lib/page/elementTypes";
import { isValidRouteSegment } from "$lib/page/elementTypes";
import type { PageRecord } from "$lib/page/pageTypes";
import { attempt } from "$lib/util/attempt";
import { errorToString, type NeverThrowError } from "$lib/util/neverThrow";
import { newId } from "$lib/util/newId";

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
  containerType?: ContainerType;
  sortIndex?: number;
};

export class PageManager {
  getAll() {
    const result = attempt(() => db.select().from(pages).all());
    if (result.error) return dbError(result.error, "getAll() failed");
    return ok(result.data);
  }

  getAllForProject(projectId: string) {
    const result = attempt(() =>
      db.select().from(pages).where(eq(pages.projectId, projectId)).all(),
    );
    if (result.error) return dbError(result.error, "getAllForProject() failed");
    return ok(result.data);
  }

  get(id: string) {
    const result = attempt(() => db.select().from(pages).where(eq(pages.id, id)).get());
    if (result.error) return dbError(result.error, "get() failed");
    if (!result.data) {
      return err({
        reason: "PAGE_NOT_FOUND",
        cause: `page ${id} does not exist`,
      } as const satisfies NeverThrowError);
    }
    return ok(result.data);
  }

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
    if (project.error) return dbError(project.error, "create() project lookup failed");
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
          containerType: input.containerType ?? "absolute",
          sortIndex,
          createdAt: now,
          updatedAt: now,
        })
        .run(),
    );
    if (inserted.error) return dbError(inserted.error, "create() insert failed");

    logger.info(`[PageManager] created page ${id}`);
    return this.get(id);
  }

  replace(
    id: string,
    input: {
      name: string;
      sortIndex: number;
      containerType?: ContainerType;
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
          ...(input.containerType === undefined ? {} : { containerType: input.containerType }),
          updatedAt: Date.now(),
        })
        .where(eq(pages.id, id))
        .run(),
    );
    if (updated.error) return dbError(updated.error, "replace() failed");

    return this.get(id);
  }

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
    if (updated.error) return dbError(updated.error, "rename() failed");

    logger.info(`[PageManager] renamed page ${id}`);
    return this.get(id);
  }

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
    if (updated.error) return dbError(updated.error, "reorder() failed");

    return this.get(id);
  }

  delete(id: string) {
    const page = this.get(id);
    if (page.isErr()) return err(page.error);

    const deleted = attempt(() => db.delete(pages).where(eq(pages.id, id)).run());
    if (deleted.error) return dbError(deleted.error, "delete() failed");

    logger.info(`[PageManager] deleted page ${id}`);
    return ok({ id });
  }

  getRoute(projectName: string, page: PageRecord) {
    return `/${projectName}/${page.name}`;
  }

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
    if (result.error) return dbError(result.error, "checkName() failed");
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
