// Web sign-in session (sign in once with World ID, then 1-tap join raffles).
//
// After a human verifies in World App ONCE against the global `signin` action
// (lib/worldid.service.ts), we mint a session that records their verified human key
// (the World ID nullifier). Every later raffle entry reuses that key as
// entries.human_key, so UNIQUE(drop_id, human_key) keeps "one entry per human per drop"
// with no re-scan. See memory: worldid-signin-once-session-model.
//
// The cookie is an HMAC-signed token `<base64url(payload)>.<base64url(sig)>` — no JWT
// dependency, no DB round-trip to read it. Tampering (changing the human key) breaks the
// signature and the session is rejected. The signing key is server-only.

import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "poh_session";
// 7 days — long enough that a demo session survives across drops without re-signing.
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface SessionPayload {
  // The verified World ID nullifier for the `signin` action — the stable human key reused
  // as entries.human_key on every raffle join.
  humanKey: string;
  // orb vs device (best-effort, for display only).
  verificationLvl: "orb" | "device" | null;
  // issued-at / expires-at (unix seconds).
  iat: number;
  exp: number;
}

function getSecret(): string {
  // Dedicated secret if set; otherwise reuse ADMIN_SECRET (already provisioned in .env +
  // Railway) so this needs no new env var to ship. Fail closed if neither exists.
  const secret = process.env.SESSION_SECRET ?? process.env.ADMIN_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET (or ADMIN_SECRET) must be set to sign sessions");
  }
  return secret;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function sign(payloadB64: string): string {
  return b64url(createHmac("sha256", getSecret()).update(payloadB64).digest());
}

// Build the signed cookie token from a verified human key.
export function encodeSession(input: {
  humanKey: string;
  verificationLvl?: "orb" | "device" | null;
}): { token: string; payload: SessionPayload } {
  const iat = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    humanKey: input.humanKey,
    verificationLvl: input.verificationLvl ?? null,
    iat,
    exp: iat + SESSION_TTL_SECONDS,
  };
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return { token: `${payloadB64}.${sign(payloadB64)}`, payload };
}

// Verify a token's signature + expiry. Returns the payload or null (never throws on bad input).
export function decodeSession(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  // Constant-time signature comparison.
  let expected: string;
  try {
    expected = sign(payloadB64);
  } catch {
    return null; // secret missing
  }
  const a = Buffer.from(sigB64);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload.humanKey !== "string" || !payload.humanKey) return null;
  if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
    return null; // expired
  }
  return payload;
}

// ---- Next.js cookie store helpers (Route Handlers / Server Components) ----

// Read + verify the current request's session. Server Components can call this to know
// whether the visitor is signed in. Returns null when absent/expired/tampered.
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return decodeSession(store.get(SESSION_COOKIE)?.value);
}

// Set the session cookie (call from a Route Handler after a successful sign-in verify).
export async function setSessionCookie(input: {
  humanKey: string;
  verificationLvl?: "orb" | "device" | null;
}): Promise<SessionPayload> {
  const { token, payload } = encodeSession(input);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return payload;
}

// Clear the session (sign out).
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
