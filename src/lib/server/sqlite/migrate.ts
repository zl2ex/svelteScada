import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./db";
import { logger } from "../pino/logger";
import { err, ok } from "neverthrow";
import { attempt } from "$lib/util/attempt";
import { errorToString, type NeverThrowError } from "$lib/util/neverThrow";

export async function runMigrations() {
  logger.info("[drizzle] runMigrations() ...");

  // Runs all pending migrations from the folder — safe to call every startup
  const migrated = await attempt(() =>
    migrate(db, { migrationsFolder: "./src/lib/server/sqlite/drizzle" }),
  );
  if (migrated.error) {
    return err({
      reason: "MIGRATE_FAILED",
      cause: `[drizzle] runMigrations() ${errorToString(migrated.error)}`,
    } as const satisfies NeverThrowError);
  }

  logger.info("[drizzle] migrations complete");
  return ok(undefined);
}
