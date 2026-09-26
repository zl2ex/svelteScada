import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./tables/index";
import { relationsConfig } from "./tables/relations";
import { resolve } from "path";
import { runMigrations } from "./migrate";
import { DB_URL } from "$env/static/private";
import { logger } from "../pino/logger";
import { attempt } from "$lib/util/attempt";
import { errorToString, type NeverThrowError } from "$lib/util/neverThrow";

const opened = attempt(() => new Database(resolve(DB_URL ?? "./database.db")));
if (opened.error) {
  const failure = {
    reason: "DB_OPEN_FAILED",
    cause: `[db] could not open the database at ${
      DB_URL ?? "./database.db"
    }: ${errorToString(opened.error)}`,
  } as const satisfies NeverThrowError;
  logger.fatal(`${failure.reason} : ${failure.cause}`);
  // module scope bootstrap: there is no caller to hand a Result to
  throw new Error(`${failure.reason} : ${failure.cause}`);
}
export const sqlite = opened.data;

const journalMode = attempt(() => sqlite.pragma("journal_mode = WAL"));
if (journalMode.error) {
  logger.warn(
    `[db] could not enable WAL journal mode: ${errorToString(
      journalMode.error,
    )}`,
  );
}

const foreignKeys = attempt(() => sqlite.pragma("foreign_keys = ON"));
if (foreignKeys.error) {
  logger.warn(
    `[db] could not enable foreign keys: ${errorToString(foreignKeys.error)}`,
  );
}

const connected = attempt(() =>
  drizzle({
    client: sqlite,
    schema,
    relations: relationsConfig,
  }),
);
if (connected.error) {
  const failure = {
    reason: "DB_DRIZZLE_INIT_FAILED",
    cause: `[db] drizzle could not be created: ${errorToString(
      connected.error,
    )}`,
  } as const satisfies NeverThrowError;
  logger.fatal(`${failure.reason} : ${failure.cause}`);
  throw new Error(`${failure.reason} : ${failure.cause}`);
}
export const db = connected.data;

const migrations = await runMigrations();
if (migrations.isErr()) {
  logger.fatal(`${migrations.error.reason} : ${migrations.error.cause}`);
  throw new Error(`${migrations.error.reason} : ${migrations.error.cause}`);
}
