// CLIENT-side AgentKit signer (test harness + M8 demo agent). This is what an agent does
// before calling a privileged MCP tool: build a SIWE message bound to the target server,
// sign it with its wallet, and emit the base64 `x-agentkit-payload` header. The SERVER side
// (lib/agentkit-auth.ts) parses + validates + verifies it.
//
// IMPORTANT protocol detail (learned the hard way): `validateAgentkitMessage` requires
// payload.domain === new URL(resourceUri).hostname (NO port), while payload.uri keeps the full
// origin (WITH port). Get this wrong → "Domain mismatch". We derive both from the resource URI.

import { formatSIWEMessage } from "@worldcoin/agentkit-core";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

export interface BuildAgentkitHeaderInput {
  // The agent's wallet private key (signs the SIWE message). Never leaves the client.
  privateKey: Hex;
  // The server resource the agent is authenticating to, e.g. "https://host/api/mcp".
  // domain (hostname) + uri (origin) are derived from this.
  resourceUri: string;
  chainId?: number; // EVM chain id; default 10143 (Monad Testnet).
  statement?: string;
  ttlSeconds?: number; // sets expirationTime; default none (validator uses maxAge instead).
  nonce?: string; // override; default random 16-hex.
}

function randomNonce(): string {
  // 16 hex chars — SIWE nonce must be alphanumeric, length >= 8.
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Build the base64 AgentKit header value for a request. Returns { header, address, payload }.
export async function buildAgentkitHeader(input: BuildAgentkitHeaderInput): Promise<{
  header: string;
  address: string;
  payload: Record<string, unknown>;
}> {
  const url = new URL(input.resourceUri);
  const origin = `${url.protocol}//${url.host}/`; // full origin WITH port → uri
  const domain = url.hostname; // hostname ONLY (no port) → domain

  const account = privateKeyToAccount(input.privateKey);
  const issuedAt = new Date().toISOString();
  const nonce = input.nonce ?? randomNonce();
  const expirationTime = input.ttlSeconds
    ? new Date(Date.now() + input.ttlSeconds * 1000).toISOString()
    : undefined;

  const info = {
    domain,
    uri: origin,
    statement: input.statement ?? "KryptonDrop agent authentication",
    version: "1",
    chainId: `eip155:${input.chainId ?? 10143}`,
    type: "eip191" as const,
    nonce,
    issuedAt,
    ...(expirationTime ? { expirationTime } : {}),
  };

  // Build the EXACT SIWE message the server will reconstruct, then sign it (EIP-191).
  const message = formatSIWEMessage(info, account.address);
  const signature = await account.signMessage({ message });

  const payload = { ...info, address: account.address, signature };
  const header = Buffer.from(JSON.stringify(payload)).toString("base64");
  return { header, address: account.address, payload };
}
