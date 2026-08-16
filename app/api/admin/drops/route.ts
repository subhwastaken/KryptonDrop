// /api/admin/drops — list (with all statuses) + create. Auth-gated (M3).
import { NextRequest } from "next/server";
import { isAuthorized, unauthorized } from "@/lib/admin-auth";
import { createDrop, listDrops, type CreateDropInput } from "@/lib/drops.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized();
  const drops = await listDrops();
  return Response.json({ drops });
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized();
  let body: CreateDropInput;
  try {
    body = (await req.json()) as CreateDropInput;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!body?.name) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }
  const drop = await createDrop(body);
  return Response.json({ ok: true, drop }, { status: 201 });
}
