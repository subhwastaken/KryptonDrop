// GET /api/admin/drops/:id — full drop state incl. variants + entry count. Auth-gated (M3).
import { NextRequest } from "next/server";
import { isAuthorized, unauthorized } from "@/lib/admin-auth";
import { getDropWithVariants, countEntries, deleteDrop } from "@/lib/drops.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  if (!isAuthorized(req)) return unauthorized();
  const { id } = await ctx.params;
  const drop = await getDropWithVariants(id);
  if (!drop) return Response.json({ error: "not found" }, { status: 404 });
  const entryCount = await countEntries(id);
  return Response.json({ drop, entryCount });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  if (!isAuthorized(req)) return unauthorized();
  const { id } = await ctx.params;
  await deleteDrop(id);
  return Response.json({ ok: true });
}
