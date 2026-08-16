// Drizzle DB client (postgres.js driver), singleton across Next hot-reloads.
// DATABASE_URL: on Railway = the private-network Postgres URL (set as a reference var);
// locally = the public TCP-proxy URL pulled into a gitignored .env. No sslmode ceremony —
// Railway Postgres handles TLS over its proxy/private network transparently.
//
// IMPORTANT: the connection is created LAZILY. Next.js evaluates route modules during the
// `next build` "collecting page data" step, where DATABASE_URL is intentionally absent
// (it's a runtime-only var on Railway). Throwing at module load would fail the build, so we
// defer connecting until the first query at runtime.

import dns from "dns";
// Globally resolve DNS queries using public DNS servers to handle refused local DNS queries.
try {
  dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
} catch (err) {
  console.warn("Failed to set custom DNS servers:", err);
}

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema";

function makeSql(): Sql {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Locally: pull it from Railway into .env. On Railway: set DATABASE_URL=${{Postgres.DATABASE_URL}} on the app service.",
    );
  }
  return postgres(connectionString, {
    max: 10,
    // Keep idle connections short-lived; Railway proxy drops long-idle sockets.
    idle_timeout: 20,
    max_lifetime: 60 * 30,
  });
}

// Reuse one postgres.js pool + drizzle instance across hot-reloads in dev so we don't leak
// connections. Lazily initialized on first access via the getters below.
const globalForDb = globalThis as unknown as {
  __pohSql?: Sql;
  __pohDb?: PostgresJsDatabase<typeof schema>;
};

function getSql(): Sql {
  if (!globalForDb.__pohSql) {
    globalForDb.__pohSql = makeSql();
  }
  return globalForDb.__pohSql;
}

function getDb(): PostgresJsDatabase<typeof schema> {
  if (!globalForDb.__pohDb) {
    globalForDb.__pohDb = drizzle(getSql(), { schema });
  }
  return globalForDb.__pohDb;
}

// Proxies so `import { db, sql } from "@/lib/db"` keeps the same ergonomics while staying
// lazy — the underlying connection is only created when a property is actually accessed.
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_t, prop) {
    return Reflect.get(getDb(), prop, getDb());
  },
  apply(_t, _thisArg, args) {
    // drizzle's db is also callable (db.execute etc. live as props; direct call is rare).
    return (getDb() as unknown as (...a: unknown[]) => unknown)(...args);
  },
}) as PostgresJsDatabase<typeof schema>;

export const sql = new Proxy(function () {} as unknown as Sql, {
  get(_t, prop) {
    return Reflect.get(getSql(), prop, getSql());
  },
  apply(_t, _thisArg, args) {
    // Enables tagged-template usage: sql`select 1`.
    return (getSql() as unknown as (...a: unknown[]) => unknown)(...args);
  },
}) as Sql;

export * from "./schema";
