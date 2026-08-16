// Admin auth gate for /api/admin/* (M3). A simple shared secret — hackathon-grade but not open.
// Accepts the secret via `x-admin-secret` header OR `?secret=` query param.
import { NextRequest } from "next/server";

export function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return false; // fail closed if not configured
  const header = req.headers.get("x-admin-secret");
  const query = req.nextUrl.searchParams.get("secret");
  const provided = header ?? query;
  if (!provided) return false;
  // constant-time-ish compare (lengths differ rarely; this is good enough for a shared demo secret)
  return provided.length === expected.length && timingSafeEqualStr(provided, expected);
}

function timingSafeEqualStr(a: string, b: string): boolean {
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
