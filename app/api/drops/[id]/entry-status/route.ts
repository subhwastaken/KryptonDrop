// GET /api/drops/:id/entry-status?entryId=... (M9) — poll a web entry's draw status.
//
// The web winner flow needs to know when a `pending` entry becomes `won` (so the
// "YOU WON — PURCHASE" CTA can appear) or `purchased`/`lost`/`expired`. The browser holds
// the entry id returned from /enter and polls this. Read-only; no auth (it only exposes
// status for an entry the caller already created, no PII).
//
// Returns: 200 { ok, status, variantId, purchaseDeadline, drawnAt, priceUsdc }
//          404 if the entry doesn't exist for this drop.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { entries } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getDrop } from "@/lib/drops.service";
import { applyDueTransitions } from "@/lib/lifecycle.service";
import { getConfirmedOrderForEntry } from "@/lib/entries.service";
import { explorerTxUrl } from "@/lib/chain";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;

  // M11 lazy trigger (on read): the web winner flow polls this. Applying due transitions here
  // means the draw fires the moment closes_at passes — the poll that crosses the deadline sees
  // the drawn state (won/lost) with no admin action. Best-effort; never blocks the read.
  await applyDueTransitions().catch((err) =>
    console.error("[entry-status] lazy transition error:", err),
  );
  const entryId = req.nextUrl.searchParams.get("entryId");
  if (!entryId) {
    return Response.json({ error: "entryId query param required" }, { status: 400 });
  }

  const [entry] = await db
    .select()
    .from(entries)
    .where(eq(entries.id, entryId))
    .limit(1);
  if (!entry || entry.dropId !== id) {
    return Response.json({ error: "entry not found for this drop" }, { status: 404 });
  }

  const drop = await getDrop(id);

  let orderInfo = null;
  if (entry.status === "purchased") {
    const order = await getConfirmedOrderForEntry(entry.id);
    if (order?.txHash) {
      orderInfo = {
        txHash: order.txHash,
        explorerUrl: explorerTxUrl(order.txHash),
      };
    }
  }

  return Response.json({
    ok: true,
    status: entry.status,
    variantId: entry.variantId,
    purchaseDeadline: entry.purchaseDeadline,
    drawnAt: drop?.drawnAt ?? null,
    priceUsdc: drop?.priceUsdc ?? null,
    order: orderInfo,
  });
}
