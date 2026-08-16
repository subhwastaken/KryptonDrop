// POST /api/drops/:id/enter — the web entry path. Funnels a signed-in human through the
// per-drop UNIQUE(drop_id, human_key) dedupe. This is the core Sybil guarantee on the web.
//
// Verification is done ONCE at sign-in (POST /api/auth/signin), which sets a session cookie
// holding the verified World ID nullifier. Entry reuses that nullifier as the human key — no
// per-drop scan. The same key across drops still gives one entry per human per drop because
// UNIQUE(drop_id, human_key) is scoped per drop.
//
// Body: { variantId?: string }   (no proof — the session is the credential)
// Returns:
//   201 { ok: true, entry }                 — first entry for this human
//   200 { ok: true, alreadyEntered: true }  — replay of the same human (Sybil block)
//   401 { error }                           — not signed in
//   404 { error } / 409 { error }           — no such drop / drop not open
import { NextRequest } from "next/server";
import { getDrop } from "@/lib/drops.service";
import { insertWebEntry, AlreadyEnteredError } from "@/lib/entries.service";
import { getWallet } from "@/lib/wallets";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;

  // Body is optional (just the chosen variant). Tolerate an empty/missing body.
  let body: { variantId?: string } = {};
  try {
    const parsed = (await req.json()) as { variantId?: string };
    if (parsed && typeof parsed === "object") body = parsed;
  } catch {
    // no body — fine
  }

  // Must be signed in with World ID (the one-time scan). No session → 401.
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "sign in with World ID first" }, { status: 401 });
  }

  const drop = await getDrop(id);
  if (!drop) return Response.json({ error: "drop not found" }, { status: 404 });
  if (drop.status !== "open") {
    return Response.json({ error: `drop is ${drop.status}, not open` }, { status: 409 });
  }

  // For the demo, a verified web human settles their winning purchase from the "human"
  // demo wallet. We store that wallet's address on the entry at entry time so the winner can
  // pay later without re-prompting — the private key is resolved server-side at purchase time
  // and never crosses the wire (mirrors the agent path). If the human wallet isn't
  // configured, fall back to no wallet (purchase route can still take { wallet }).
  let humanWalletAddress: string | null = null;
  try {
    humanWalletAddress = getWallet("human").address;
  } catch {
    humanWalletAddress = null;
  }

  // Funnel through the per-drop unique constraint, keyed by the signed-in human key.
  try {
    const entry = await insertWebEntry({
      dropId: id,
      nullifier: session.humanKey,
      variantId: body.variantId ?? null,
      verificationLvl: session.verificationLvl,
      walletAddress: humanWalletAddress,
    });
    return Response.json({ ok: true, entry }, { status: 201 });
  } catch (err) {
    if (err instanceof AlreadyEnteredError) {
      // Friendly "you're already entered" — the Sybil block in action.
      return Response.json({ ok: true, alreadyEntered: true }, { status: 200 });
    }
    console.error(`[drops/${id}/enter] insert error:`, err);
    return Response.json({ error: "failed to record entry" }, { status: 500 });
  }
}
