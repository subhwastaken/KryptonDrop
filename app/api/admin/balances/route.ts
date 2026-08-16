// GET /api/admin/balances (M5) — read USDC + native ETH balances for the demo wallets on
// chain 4801. Auth-gated. Drives the pre-demo checklist (M10) and confirms funding.
//   ?address=0x... → balances for an arbitrary address
//   (no query)     → balances for all configured demo wallets (agent1/agent2/human/agent)
import { NextRequest } from "next/server";
import { isAuthorized, unauthorized } from "@/lib/admin-auth";
import { getBalances } from "@/lib/settlement.service";
import { getWallet, listWalletNames } from "@/lib/wallets";
import { CHAIN_ID } from "@/lib/chain";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized();

  const address = req.nextUrl.searchParams.get("address");
  try {
    if (address) {
      const b = await getBalances(address);
      return Response.json({
        chainId: CHAIN_ID,
        balances: [{ name: null, address: b.address, eth: b.eth, usdc: b.usdc }],
      });
    }
    const names = listWalletNames();
    const balances = await Promise.all(
      names.map(async (name) => {
        const w = getWallet(name);
        const b = await getBalances(w.address);
        return { name, address: b.address, eth: b.eth, usdc: b.usdc };
      }),
    );
    return Response.json({ chainId: CHAIN_ID, balances });
  } catch (err) {
    console.error("[admin/balances] error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "balance read failed" },
      { status: 500 },
    );
  }
}
