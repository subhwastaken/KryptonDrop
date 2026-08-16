// GET /api/auth/me — whether the current visitor is signed in with World ID, and (if so)
// a short, non-sensitive fingerprint of their human key for the header UI. Never returns
// the full nullifier to the client.
//
// Returns: 200 { signedIn: boolean, verificationLvl?, humanKeyShort? }
import { getSession } from "@/lib/session";
import { publishSignedInHuman } from "@/lib/delegate.service";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ signedIn: false });

  await publishSignedInHuman(session.humanKey);

  const key = session.humanKey;
  // e.g. "0x2bf8…a91c" — enough to recognize the session, not the full key.
  const humanKeyShort =
    key.length > 12 ? `${key.slice(0, 6)}…${key.slice(-4)}` : key;

  return Response.json({
    signedIn: true,
    verificationLvl: session.verificationLvl,
    humanKeyShort,
  });
}
