// World ID v4 (managed/cloud RP) verification service (M4) — the core Sybil guarantee
// on the WEB path. Targets World ID **v4**, NOT v3 `verifyCloudProof`.
//
// Ground truth (RALPH_GUIDE.md §5 / PRD §0, re-confirmed via get_app_config 2026-06-13):
//   app   = app_1f62e669c5b6b7ec0b22ee9fcb295a0a   (engine: cloud, active)
//   rp_id = rp_8a9bfc2fcfa0ada9                     (managed RP, registered)
//   verify endpoint = POST https://developer.world.org/api/v4/verify/{rp_id}  (no auth header)
//
// The v4 flow (per @worldcoin/idkit@4.1.8 + docs.world.org/world-id/idkit):
//   1. The browser asks our backend to mint an **rp_context** — a server-signed
//      { rp_id, nonce, created_at, expires_at, signature } produced by `signRequest`
//      using the RP signing key. The signing key NEVER touches the client.
//   2. The IDKit widget builds a proof request from app_id + action + rp_context and the
//      user verifies in World App, yielding an `IDKitResult` (protocol_version "4.0",
//      a per-(rp,action) `nullifier`, and a 5-element proof array).
//   3. The backend POSTs that `IDKitResult` verbatim to the v4 verify endpoint, which
//      returns { success, nullifier, ... }. The verified `nullifier` is the dedupe key.

import { signRequest, type RpSignature } from "@worldcoin/idkit/signing";

// ---- Env config (server-only) ---------------------------------------------
// WORLD_APP_RP_ID + WORLD_APP_SIGNER_KEY come from `secret_keys` → .env / Railway vars.
// WORLD_APP_ID is also exposed to the client as NEXT_PUBLIC_WORLD_APP_ID (see lib/worldid.public.ts).
export function getRpId(): string {
  const rp = process.env.WORLD_APP_RP_ID;
  if (!rp) throw new Error("WORLD_APP_RP_ID is not set");
  return rp;
}

function getSigningKey(): string {
  // The RP's ECDSA signing key (kept server-side only). In secret_keys this is
  // WORLD_APP_SIGNER_KEY; allow RP_SIGNING_KEY as an alias for parity with the docs.
  const key = process.env.WORLD_APP_SIGNER_KEY ?? process.env.RP_SIGNING_KEY;
  if (!key) throw new Error("WORLD_APP_SIGNER_KEY is not set");
  return key;
}

export function getAppId(): string {
  const id = process.env.WORLD_APP_ID;
  if (!id) throw new Error("WORLD_APP_ID is not set");
  return id;
}

const VERIFY_BASE = "https://developer.world.org/api/v4/verify";

// The single global "Sign in with World ID" action. The user verifies against THIS once;
// the resulting nullifier is their stable human key, cached in a session cookie and reused
// as entries.human_key on every later raffle join (no re-scan). `signRequest` signs an
// arbitrary action string locally with the RP key — this action does NOT need to be
// registered in the developer portal for verify to work (it checks the nullifier against
// the (rp_id, action) pair). See memory: worldid-signin-once-session-model.
export const SIGNIN_ACTION = "signin";

// ---- rp_context minting ---------------------------------------------------
// Returns the object the browser hands to the IDKit widget. `signRequest` builds the
// signed message (version || nonce || createdAt || expiresAt || action) over the RP key.
// `action` is REQUIRED for our uniqueness proofs (one slot per human per drop).
export interface RpContext {
  rp_id: string;
  nonce: string;
  created_at: number;
  expires_at: number;
  signature: string;
}

export function mintRpContext(action: string, ttlSeconds = 300): RpContext {
  if (!action) throw new Error("action is required to mint rp_context");
  const sig: RpSignature = signRequest({
    signingKeyHex: getSigningKey(),
    action,
    ttl: ttlSeconds,
  });
  return {
    rp_id: getRpId(),
    nonce: sig.nonce,
    created_at: sig.createdAt,
    expires_at: sig.expiresAt,
    signature: sig.sig,
  };
}

// ---- Proof verification ----------------------------------------------------
// The shape the verify endpoint returns on success. We only need `nullifier` (the
// per-(rp, action) dedupe key) + `success`; the rest is recorded for debugging.
export interface VerifyResult {
  success: boolean;
  action?: string;
  nullifier?: string;
  environment?: string;
  results?: Array<{
    identifier: string;
    success: boolean;
    nullifier?: string;
    code?: string;
    detail?: string;
  }>;
  code?: string;
  detail?: string;
  message?: string;
}

export class WorldIdVerifyError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
    public readonly body: unknown,
  ) {
    super(message);
  }
}

// `idkitResult` is the full IDKitResult object emitted by the widget. The v4 verify
// endpoint accepts it verbatim (no reshaping / no signal_hash computation in v4).
export async function verifyV4Proof(idkitResult: unknown): Promise<VerifyResult> {
  const rpId = getRpId();
  const res = await fetch(`${VERIFY_BASE}/${rpId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(idkitResult),
  });

  let body: VerifyResult;
  try {
    body = (await res.json()) as VerifyResult;
  } catch {
    throw new WorldIdVerifyError(
      `verify endpoint returned non-JSON (HTTP ${res.status})`,
      res.status,
      null,
    );
  }

  if (!res.ok || body.success !== true) {
    throw new WorldIdVerifyError(
      body.detail || body.message || body.code || `verification failed (HTTP ${res.status})`,
      res.status,
      body,
    );
  }
  return body;
}

// Pull the verified nullifier out of a successful verify response. The top-level
// `nullifier` is the canonical one; fall back to the first per-credential result.
export function nullifierFromResult(result: VerifyResult): string {
  const n = result.nullifier ?? result.results?.find((r) => r.success && r.nullifier)?.nullifier;
  if (!n) throw new Error("verify succeeded but no nullifier in response");
  return n;
}
