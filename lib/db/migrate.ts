// Standalone migration runner: applies SQL files in ./drizzle against DATABASE_URL.
// Run with `pnpm db:migrate` (locally, uses .env) or `railway run pnpm db:migrate`.
// Kept separate from lib/db/index.ts so it can use a single short-lived connection.

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { config } from "dotenv";

// Load .env for local runs (Railway injects env directly, where .env is absent — harmless).
config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[db:migrate] DATABASE_URL is not set.");
  process.exit(1);
}

async function main() {
  const sql = postgres(connectionString!, { max: 1 });
  const db = drizzle(sql);
  console.log("[db:migrate] applying migrations from ./drizzle ...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[db:migrate] done.");
  await sql.end();
}

main().catch((err) => {
  console.error("[db:migrate] failed:", err);
  process.exit(1);
});
