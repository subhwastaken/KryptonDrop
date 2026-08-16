// GET /api/admin/drops/:id/entries (M9) — the operator's cross-surface entry view.
// Returns every entry for a drop with its source ('web' = World ID nullifier, 'agent' =
// AgentKit humanId) and status, so the admin console can show that BOTH surfaces honor the
// same one-slot-per-human rule (PRD M9 step 5). Auth-gated.
import { NextRequest } from "next/server";
import { isAuthorized, unauthorized } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { entries } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  if (!isAuthorized(req)) return unauthorized();
  const { id } = await ctx.params;

  const rows = await db
    .select({
      id: entries.id,
      source: entries.source,
      status: entries.status,
      humanKey: entries.humanKey,
      walletAddress: entries.walletAddress,
      createdAt: entries.createdAt,
    })
    .from(entries)
    .where(eq(entries.dropId, id))
    .orderBy(entries.createdAt);

  const web = rows.filter((r) => r.source === "web").length;
  const agent = rows.filter((r) => r.source === "agent").length;

  // Truncate the human key for display — it's a long nullifier / humanId.
  const view = rows.map((r) => ({
    ...r,
    humanKey:
      r.humanKey.length > 18
        ? `${r.humanKey.slice(0, 10)}…${r.humanKey.slice(-6)}`
        : r.humanKey,
  }));

  return Response.json({ ok: true, entries: view, counts: { web, agent, total: rows.length } });
}
