import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./tables/index";
import { relationsConfig } from "./tables/relations";
import { resolve } from "path";
import { runMigrations } from "./migrate";
import { DB_URL } from "$env/static/private";

export const sqlite = new Database(
  resolve(DB_URL ?? "./src/lib/server/sqlite/database/database.db"),
);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle({ client: sqlite, schema, relations: relationsConfig });

runMigrations();
