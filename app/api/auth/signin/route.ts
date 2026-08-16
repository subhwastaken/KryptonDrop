// POST /api/auth/signin — verify the one-time "Sign in with World ID" proof and open a
// session. The verified nullifier (for the global `signin` action) becomes the human's
// stable key, stored in an HMAC-signed cookie. After this, raffle joins reuse the session
// and need no re-scan.
//
// Body: { idkitResult: IDKitResult }
// Returns:
//   200 { ok: true, signedIn: true, verificationLvl }   — session cookie set
//   422 { error }                                        — proof failed verification
//   400 { error }                                        — bad body
import { NextRequest } from "next/server";
import {
  verifyV4Proof,
  nullifierFromResult,
  WorldIdVerifyError,
  SIGNIN_ACTION,
} from "@/lib/worldid.service";
import { setSessionCookie } from "@/lib/session";
import { publishSignedInHuman } from "@/lib/delegate.service";

export const dynamic = "force-dynamic";

// Bind the proof to the sign-in action (a proof minted for a drop action can't be used to
// sign in, and vice-versa).
function actionOf(result: unknown): string | undefined {
  if (typeof result === "object" && result !== null && "action" in result) {
    const a = (result as { action?: unknown }).action;
    return typeof a === "string" ? a : undefined;
  }
  return undefined;
}

function verificationLvlOf(result: unknown): "orb" | "device" | null {
  if (
    typeof result === "object" &&
    result !== null &&
    "responses" in result &&
    Array.isArray((result as { responses?: unknown[] }).responses)
  ) {
    const responses = (result as { responses: Array<{ identifier?: string }> }).responses;
    const id = responses[0]?.identifier;
    if (id === "proof_of_human" || id === "orb") return "orb";
    if (id) return "device";
  }
  return null;
}

export async function POST(req: NextRequest) {
  let body: { idkitResult?: unknown };
  try {
    body = (await req.json()) as { idkitResult?: unknown };
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!body.idkitResult) {
    return Response.json({ error: "idkitResult required" }, { status: 400 });
  }

  const proofAction = actionOf(body.idkitResult);
  if (proofAction && proofAction !== SIGNIN_ACTION) {
    return Response.json(
      { error: "proof action is not the sign-in action" },
      { status: 422 },
    );
  }

  let nullifier: string;
  try {
    const result = await verifyV4Proof(body.idkitResult);
    nullifier = nullifierFromResult(result);
  } catch (err) {
    if (err instanceof WorldIdVerifyError) {
      console.warn("[auth/signin] verify failed:", err.message, err.body);
      return Response.json(
        { error: "World ID verification failed", detail: err.message },
        { status: 422 },
      );
    }
    console.error("[auth/signin] verify error:", err);
    return Response.json({ error: "verification error" }, { status: 500 });
  }

  const verificationLvl = verificationLvlOf(body.idkitResult);
  await setSessionCookie({ humanKey: nullifier, verificationLvl });
  await publishSignedInHuman(nullifier);
  return Response.json({ ok: true, signedIn: true, verificationLvl });
}
