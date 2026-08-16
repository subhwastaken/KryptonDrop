// POST /api/admin/seed — (re)create the demo drops. Auth-gated (M3).
import { NextRequest } from "next/server";
import { isAuthorized, unauthorized } from "@/lib/admin-auth";
import { seedDemo } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized();
  const drops = await seedDemo();
  return Response.json({ ok: true, drops });
}
