// POST /api/drops/:id/purchase (M6) — the winner exercises their purchase window.
// A `won` entry within its window settles a REAL USDC `price_usdc` transfer (M5) from the
// winner's wallet → the drop's receiver/merchant, then becomes `purchased`. Non-winners,
// lost, pending, expired, or already-purchased entries are rejected.
//
// Body: { entryId: string, wallet?: "agent1"|"agent2"|"human"|"agent" }
//   - The signing wallet is resolved SERVER-SIDE (keys never cross the wire): from the
//     entry's stored `wallet_address` if present, else from the `wallet` name in the body.
// Returns:
//   200 { ok: true, txHash, explorerUrl, amountUsdc, orderId, status: "purchased" }
//   402 insufficient funds · 403 not a winner · 409 expired/already · 404 not found
import { NextRequest } from "next/server";
import {
  purchaseForEntry,
  NotAWinnerError,
  WindowExpiredError,
  AlreadyPurchasedError,
} from "@/lib/draw.service";
import { getDrop, NotFoundError } from "@/lib/drops.service";
import { db } from "@/lib/db";
import { entries } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getWallet, getWalletByAddress, getReceiverAddress } from "@/lib/wallets";
import { InsufficientFundsError } from "@/lib/settlement.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;

  let body: { entryId?: string; wallet?: string };
  try {
    body = (await req.json()) as { entryId?: string; wallet?: string };
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!body.entryId) {
    return Response.json({ error: "entryId required" }, { status: 400 });
  }

  const drop = await getDrop(id);
  if (!drop) return Response.json({ error: "drop not found" }, { status: 404 });

  // Load the entry to resolve its signing wallet (and confirm it belongs to this drop).
  const [entry] = await db
    .select()
    .from(entries)
    .where(eq(entries.id, body.entryId))
    .limit(1);
  if (!entry || entry.dropId !== id) {
    return Response.json({ error: "entry not found for this drop" }, { status: 404 });
  }

  // Resolve the winner's wallet: prefer the entry's stored address; else a named demo wallet.
  let signer;
  try {
    signer = entry.walletAddress
      ? getWalletByAddress(entry.walletAddress)
      : body.wallet
        ? getWallet(body.wallet)
        : undefined;
  } catch {
    signer = undefined;
  }
  if (!signer) {
    return Response.json(
      {
        error:
          "no signing wallet for this entry (entry has no known demo wallet; pass { wallet })",
      },
      { status: 400 },
    );
  }

  const receiver = drop.receiverAddress || getReceiverAddress();

  try {
    const result = await purchaseForEntry({
      entryId: entry.id,
      privateKey: signer.privateKey,
      receiverAddress: receiver,
    });
    return Response.json({ ok: true, ...result }, { status: 200 });
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      return Response.json({ error: err.message }, { status: 402 });
    }
    if (err instanceof NotAWinnerError) {
      return Response.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof WindowExpiredError || err instanceof AlreadyPurchasedError) {
      return Response.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof NotFoundError) {
      return Response.json({ error: err.message }, { status: 404 });
    }
    console.error(`[drops/${id}/purchase] error:`, err);
    return Response.json(
      { error: err instanceof Error ? err.message : "purchase failed" },
      { status: 500 },
    );
  }
}
