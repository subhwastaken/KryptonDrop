// POST /api/admin/test-transfer (M5) — prove the USDC money path on chain 4801 WITHOUT a
// full draw. Sends a real USDC transfer between two demo wallets and records it in `orders`.
// Auth-gated. The private keys are resolved server-side by wallet NAME (never sent by the client).
//
// Body: { from?: "agent1"|"agent2"|"human"|"agent", to?: <name or 0xaddress>, amount?: string|number }
//   defaults: from=agent1, to=agent2, amount="1" (1 USDC) — small so we don't drain faucets.
import { NextRequest } from "next/server";
import { isAuthorized, unauthorized } from "@/lib/admin-auth";
import { transferUsdc, InsufficientFundsError } from "@/lib/settlement.service";
import { getWallet } from "@/lib/wallets";

export const dynamic = "force-dynamic";

function resolveTo(to: string): string {
  // Accept either a demo-wallet name or a raw 0x address.
  if (to.startsWith("0x")) return to;
  return getWallet(to).address;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized();

  let body: { from?: string; to?: string; amount?: string | number };
  try {
    body = (await req.json().catch(() => ({}))) as typeof body;
  } catch {
    body = {};
  }

  const fromName = body.from ?? "agent1";
  const toRef = body.to ?? "agent2";
  const amount = body.amount ?? "1";

  try {
    const sender = getWallet(fromName);
    const to = resolveTo(String(toRef));

    const result = await transferUsdc({
      privateKey: sender.privateKey,
      to,
      amount,
      recordOrder: true,
    });

    return Response.json({
      ok: result.status === "confirmed",
      txHash: result.txHash,
      explorerUrl: result.explorerUrl,
      from: result.from,
      to: result.to,
      amountUsdc: result.amountUsdc,
      status: result.status,
      orderId: result.orderId,
    });
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      return Response.json({ error: err.message }, { status: 402 });
    }
    console.error("[admin/test-transfer] error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "transfer failed" },
      { status: 500 },
    );
  }
}
