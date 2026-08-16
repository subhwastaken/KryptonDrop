// POST /api/auth/signin-context — mint a server-signed rp_context for the global `signin`
// World ID action. The browser calls this right before opening the IDKit widget for the
// one-time "Sign in with World ID" scan. The RP signing key stays server-side.
//
// Body: {}  →  { rp_context, app_id, action }
import { mintRpContext, getAppId, SIGNIN_ACTION } from "@/lib/worldid.service";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const rp_context = mintRpContext(SIGNIN_ACTION);
    return Response.json({ rp_context, app_id: getAppId(), action: SIGNIN_ACTION });
  } catch (err) {
    console.error("[auth/signin-context] mint error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "failed to mint rp_context" },
      { status: 500 },
    );
  }
}
