// DB liveness probe (M2): runs SELECT 1 against Railway Postgres.
// Proves both local and the Railway app service can reach the database.
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await sql`select 1`;
    return Response.json({ db: "ok" });
  } catch (err) {
    console.error("[health/db] query failed:", err);
    return Response.json(
      { db: "error", message: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    );
  }
}
