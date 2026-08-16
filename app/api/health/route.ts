// Liveness probe used by M1's Railway deploy check.
// Must stay dependency-free so it works before the DB lands in M2.
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ ok: true });
}
