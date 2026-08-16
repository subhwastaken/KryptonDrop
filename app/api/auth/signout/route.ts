// POST /api/auth/signout — clear the World ID sign-in session cookie.
import { clearSessionCookie } from "@/lib/session";
import { clearSignedInHuman } from "@/lib/delegate.service";

export const dynamic = "force-dynamic";

export async function POST() {
  await clearSessionCookie();
  await clearSignedInHuman();
  return Response.json({ ok: true, signedIn: false });
}
