import { eq } from "drizzle-orm";
import { err, ok } from "neverthrow";
import { db } from "$lib/server/sqlite/db";
import { projects } from "$lib/sqlite/tables";
import { attempt } from "$lib/util/attempt";
import { errorToString, type NeverThrowError } from "$lib/util/neverThrow";

export class ProjectManager {
  getAll() {
    const result = attempt(() => db.select().from(projects).all());
    if (result.error) {
      return err({
        reason: "DB_ERROR",
        cause: `getAll() failed: ${errorToString(result.error)}`,
      } as const satisfies NeverThrowError);
    }
    return ok(result.data);
  }

  getById(id: string) {
    const result = attempt(() =>
      db.select().from(projects).where(eq(projects.id, id)).get(),
    );
    if (result.error) {
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

  getByName(name: string) {
    const result = attempt(() =>
      db.select().from(projects).where(eq(projects.name, name)).get(),
    );
    if (result.error) {
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
}

export const projectManager = new ProjectManager();
