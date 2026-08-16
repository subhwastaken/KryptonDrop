// AgentKit native per-request auth (M7, Option A — RALPH_GUIDE.md §3 / PRD §0).
//
// There is NO "delegated bearer token" in AgentKit. The real primitive is a per-request
// SIWE-style signed payload (`@worldcoin/agentkit-core`): the agent signs a CAIP-122/SIWE
// message binding (domain, uri, chainId, nonce, issuedAt) and sends it base64-encoded in a
// header. We:
//   1. parse the header           → AgentkitPayload                (parseAgentkitHeader)
//   2. validate the message body  → domain/uri/timing match us     (validateAgentkitMessage)
//   3. verify the signature       → recover + check the wallet     (verifyAgentkitSignature)
//   4. resolve wallet → humanId   → AgentBook on World Chain        (createAgentBookVerifier)
//
// The resulting `humanId` becomes the entry's `human_key` (source='agent'), funneling through
// the SAME UNIQUE(drop_id, human_key) Sybil guarantee as the web nullifier path.
//
// HONEST CAVEAT (documented in PROGRESS.md M7): AgentBook registration of a wallet → an
// on-chain anonymous humanId is a real World-App-gated flow we cannot perform headlessly for
// the demo wallets. So `lookupHuman` returns null for our (unregistered) demo wallets. The
// SIGNATURE VERIFICATION — the actual AgentKit security primitive — is genuinely enforced on
// every privileged call; for the humanId we fall back to a deterministic, wallet-scoped id
// (`agentkit:<checksummed-address>`) so one wallet still == one human-slot. When AgentBook
// resolves a real humanId, that wins. This keeps the Sybil guarantee per-surface honest:
// web nullifiers and agent humanIds are different namespaces (PRD M7 step 4).

import {
  parseAgentkitHeader,
  validateAgentkitMessage,
  verifyAgentkitSignature,
  createAgentBookVerifier,
  type AgentkitPayload,
} from "@worldcoin/agentkit-core";
import { getAddress } from "viem";

// The header the agent sends. x402/AgentKit convention is a single base64 payload header.
// We accept a couple of common spellings so different clients interoperate.
export const AGENTKIT_HEADER = "x-agentkit-payload";
const HEADER_ALIASES = [
  AGENTKIT_HEADER,
  "x-agentkit",
  "agentkit-payload",
  "x-payment", // x402-style
];

export class AgentkitAuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface AgentIdentity {
  // The dedupe key for agent entries (= AgentBook humanId, or the wallet-scoped fallback).
  humanId: string;
  // The verified wallet address that signed the request (checksummed).
  walletAddress: string;
  // True if `humanId` came from a real AgentBook on-chain lookup; false = wallet-scoped fallback.
  agentBookResolved: boolean;
  // The raw verified payload (audit / debugging).
  payload: AgentkitPayload;
}

// Resolve the public origin this server is reachable at, so the SIWE domain/uri the agent
// signed must match where the request actually landed (replay-binding). Prefer the request's
// own origin; fall back to PUBLIC_BASE_URL.
export function resourceUriFromRequest(req: Request): string {
  // Honor proxy headers (Railway terminates TLS and forwards) so we reconstruct the public URL.
  const xfProto = req.headers.get("x-forwarded-proto");
  const xfHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (xfHost) {
    const proto = xfProto ?? "https";
    return `${proto}://${xfHost}/`;
  }
  const base = process.env.PUBLIC_BASE_URL;
  if (base) return base.endsWith("/") ? base : `${base}/`;
  // Last resort: the request URL's origin.
  return new URL(req.url).origin + "/";
}

function readHeader(req: Request): string | null {
  for (const name of HEADER_ALIASES) {
    const v = req.headers.get(name);
    if (v && v.trim().length > 0) return v.trim();
  }
  return null;
}

// A lazily-constructed AgentBook verifier pointed at World Chain (the canonical AgentBook
// deployment). lookupHuman gracefully returns null for unregistered wallets.
let _verifier: ReturnType<typeof createAgentBookVerifier> | null = null;
function agentBook() {
  if (!_verifier) {
    _verifier = createAgentBookVerifier({
      // World Chain mainnet RPC for the AgentBook read; falls back to the chain default if unset.
      rpcUrl: process.env.AGENTBOOK_RPC_URL || undefined,
    });
  }
  return _verifier;
}

// Deterministic, wallet-scoped humanId used when AgentBook has no registration for the wallet
// (the demo case). Distinct wallets → distinct ids; the SAME wallet always maps to the SAME id,
// so one wallet == one slot per drop. Namespaced so it can never collide with a web nullifier.
function fallbackHumanId(address: string): string {
  return `agentkit:${getAddress(address)}`;
}

export interface AuthenticateOptions {
  // Override the expected resource URI (defaults to the request's public origin). The agent
  // must have signed a message whose domain/uri match this.
  expectedResourceUri?: string;
  // Max signed-message age in ms (default 5 min) — replay window.
  maxAgeMs?: number;
}

// Authenticate a privileged MCP/agent request. Throws AgentkitAuthError (mapped to a 402
// challenge by callers) when no/invalid signature is present. Returns the resolved identity.
export async function authenticateAgent(
  req: Request,
  opts: AuthenticateOptions = {},
): Promise<AgentIdentity> {
  const header = readHeader(req);
  if (!header) {
    throw new AgentkitAuthError(
      "missing_signature",
      `missing AgentKit signature header (${AGENTKIT_HEADER})`,
    );
  }

  // 1) Parse the base64(JSON) payload into a validated SIWE-shaped AgentkitPayload.
  let payload: AgentkitPayload;
  try {
    payload = parseAgentkitHeader(header);
  } catch (err) {
    throw new AgentkitAuthError(
      "bad_payload",
      `invalid AgentKit payload: ${(err as Error).message}`,
    );
  }

  // 2) Validate the message binds to THIS server (domain/uri) and is fresh (timing/replay).
  const expectedResourceUri = opts.expectedResourceUri ?? resourceUriFromRequest(req);
  const validation = await validateAgentkitMessage(payload, expectedResourceUri, {
    maxAge: opts.maxAgeMs,
  });
  if (!validation.valid) {
    throw new AgentkitAuthError(
      "message_invalid",
      `AgentKit message validation failed: ${validation.error}`,
    );
  }

  // 3) Cryptographically verify the signature recovers the claimed wallet (EOA via EIP-191 or
  //    smart wallet via ERC-1271). Needs an RPC to do the universal verification.
  const rpcUrl =
    process.env.AGENTKIT_VERIFY_RPC_URL ||
    process.env.WORLD_CHAIN_SEPOLIA_RPC ||
    undefined;
  const verify = await verifyAgentkitSignature(payload, rpcUrl);
  if (!verify.valid || !verify.address) {
    throw new AgentkitAuthError(
      "signature_invalid",
      `AgentKit signature verification failed: ${verify.error ?? "no address recovered"}`,
    );
  }
  const walletAddress = getAddress(verify.address);

  // 4) Resolve the verified wallet → anonymous humanId via AgentBook on World Chain. If the
  //    wallet isn't registered (the demo case), fall back to a deterministic wallet-scoped id.
  let humanId: string;
  let agentBookResolved = false;
  try {
    const looked = await agentBook().lookupHuman(walletAddress);
    if (looked) {
      humanId = looked;
      agentBookResolved = true;
    } else {
      humanId = fallbackHumanId(walletAddress);
    }
  } catch {
    humanId = fallbackHumanId(walletAddress);
  }

  return { humanId, walletAddress, agentBookResolved, payload };
}
