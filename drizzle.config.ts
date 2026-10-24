import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/lib/sqlite/tables/index.ts",
  out: "./src/lib/server/sqlite/drizzle",
  dbCredentials: {
    url: process.env.DB_URL ?? "./database.db",
  },
});
