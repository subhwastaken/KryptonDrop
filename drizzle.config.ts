import { defineConfig } from "drizzle-kit";

// drizzle-kit reads DATABASE_URL from the environment. Locally it's loaded from the
// gitignored .env (drizzle-kit auto-loads .env); on Railway use `railway run pnpm db:migrate`
// which injects the service DATABASE_URL.
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
