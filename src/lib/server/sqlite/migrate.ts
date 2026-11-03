import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { logger } from "../pino/logger";
import { err, ok } from "neverthrow";
import { attempt } from "$lib/util/attempt";
import { errorToString, type NeverThrowError } from "$lib/util/neverThrow";

export async function runMigrations() {
  logger.info("[drizzle] runMigrations() ...");

  // SQLite migrations rebuild tables by dropping the old one. With foreign
  // keys enabled, that fires ON DELETE CASCADE on child tables, so disable
  // them outside the migration transaction (the PRAGMA is a no-op inside it).
  const disabled = attempt(() => db.run(sql`PRAGMA foreign_keys=OFF`));
  if (disabled.isErr) {
    return err({
      reason: "MIGRATE_FAILED",
      cause: `[drizzle] runMigrations() could not disable foreign keys: ${errorToString(disabled.error)}`,
    } as const satisfies NeverThrowError);
  }

  // Runs all pending migrations from the folder — safe to call every startup
  const migrated = await attempt(() =>
    migrate(db, { migrationsFolder: "./src/lib/server/sqlite/drizzle" }),
  );

  const enabled = attempt(() => db.run(sql`PRAGMA foreign_keys=ON`));
  if (enabled.isErr) {
    return err({
      reason: "MIGRATE_FAILED",
      cause: `[drizzle] runMigrations() could not re-enable foreign keys: ${errorToString(enabled.error)}`,
    } as const satisfies NeverThrowError);
  }

  if (migrated.isErr) {
    return err({
      reason: "MIGRATE_FAILED",
      cause: `[drizzle] runMigrations() ${errorToString(migrated.error)}`,
    } as const satisfies NeverThrowError);
  }

  logger.info("[drizzle] migrations complete");
  return ok(undefined);
}
