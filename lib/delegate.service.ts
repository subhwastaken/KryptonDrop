// One verified World ID human may authorize exactly one AI agent.
// That agent may enter/purchase only while that human is signed in.
// Unsigned bots cannot mint a human slot — no World ID session, no agent action.

import { eq } from "drizzle-orm";
import { getAddress } from "viem";
import { db } from "@/lib/db";
import { agents, sessions } from "@/lib/db/schema";
import { getWallet } from "@/lib/wallets";

export const WEB_SIGNED_IN_TOKEN = "krypton:web-signed-in";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class NoSignedInHumanError extends Error {
  constructor() {
    super(
      "No verified World ID human is signed in. Only a signed-in human can send their one authorized agent.",
    );
    this.name = "NoSignedInHumanError";
  }
}

export class UnauthorizedAgentError extends Error {
  constructor() {
    super(
      "This agent is not the single agent authorized by the signed-in World ID human. Bots and extra agents cannot enter or buy.",
    );
    this.name = "UnauthorizedAgentError";
  }
}

export interface SignedInHuman {
  humanKey: string;
  expiresAt: Date;
}

export interface OnBehalfContext {
  humanKey: string;
  agentWallet: string;
}

export async function publishSignedInHuman(humanKey: string): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db
    .insert(sessions)
    .values({
      token: WEB_SIGNED_IN_TOKEN,
      humanId: humanKey,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: sessions.token,
      set: { humanId: humanKey, expiresAt },
    });

  // Bind at most one agent wallet to this human (agent1 if they do not already have one).
  const [already] = await db
    .select()
    .from(agents)
    .where(eq(agents.humanId, humanKey))
    .limit(1);
  if (already) return;

  try {
    const agent1 = getWallet("agent1");
    const [walletRow] = await db
      .select()
      .from(agents)
      .where(eq(agents.walletAddress, agent1.address))
      .limit(1);
    if (walletRow?.humanId && walletRow.humanId !== humanKey) {
      // agent1 already belongs to a different verified human — do not steal it.
      return;
    }
    await db
      .insert(agents)
      .values({
        walletAddress: agent1.address,
        humanId: humanKey,
      })
      .onConflictDoUpdate({
        target: agents.walletAddress,
        set: { humanId: humanKey },
      });
  } catch {
    // Agent1 wallet optional at sign-in; MCP will still require a bound agent to act.
  }
}

export async function clearSignedInHuman(): Promise<void> {
  await db.delete(sessions).where(eq(sessions.token, WEB_SIGNED_IN_TOKEN));
}

export async function getSignedInHuman(): Promise<SignedInHuman | null> {
  const [row] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.token, WEB_SIGNED_IN_TOKEN))
    .limit(1);
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.token, WEB_SIGNED_IN_TOKEN));
    return null;
  }
  return { humanKey: row.humanId, expiresAt: row.expiresAt };
}

export async function requireSignedInHuman(): Promise<SignedInHuman> {
  const human = await getSignedInHuman();
  if (!human) throw new NoSignedInHumanError();
  return human;
}

/** Caller wallet may act only if it is the one agent bound to the signed-in World ID human. */
export async function authorizeOnBehalf(callerWallet: string): Promise<OnBehalfContext> {
  const human = await requireSignedInHuman();
  const caller = getAddress(callerWallet);

  const [bound] = await db
    .select()
    .from(agents)
    .where(eq(agents.humanId, human.humanKey))
    .limit(1);

  if (!bound?.walletAddress) {
    throw new UnauthorizedAgentError();
  }
  if (getAddress(bound.walletAddress) !== caller) {
    throw new UnauthorizedAgentError();
  }

  return { humanKey: human.humanKey, agentWallet: caller };
}
