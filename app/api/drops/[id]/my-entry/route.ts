import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import {
  findEntryForSignedInHuman,
  getConfirmedOrderForEntry,
} from "@/lib/entries.service";
import { explorerTxUrl } from "@/lib/chain";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) {
    return Response.json({ ok: true, entry: null });
  }

  const entry = await findEntryForSignedInHuman(id, session.humanKey);
  if (!entry) return Response.json({ ok: true, entry: null });

  let order: { txHash: string; explorerUrl: string } | null = null;
  if (entry.status === "purchased") {
    const confirmed = await getConfirmedOrderForEntry(entry.id);
    if (confirmed?.txHash) {
      order = {
        txHash: confirmed.txHash,
        explorerUrl: explorerTxUrl(confirmed.txHash),
      };
    }
  }

  return Response.json({ ok: true, entry, order });
}
