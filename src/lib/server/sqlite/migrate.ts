import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./db";
import { logger } from "../pino/logger";

export async function runMigrations() {
  logger.info("[drizzle] runMigrations() ...");

  // Runs all pending migrations from the folder — safe to call every startup
  migrate(db, { migrationsFolder: "./src/lib/server/sqlite/drizzle" });

  logger.info("[drizzle] migrations complete");
}
