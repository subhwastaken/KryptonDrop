// Entry service (M4) — the per-drop dedupe funnel. EVERY entry path (web nullifier,
// agent humanId) must go through `insertEntry` so it hits UNIQUE(drop_id, human_key) —
// that constraint IS the Sybil guarantee (RALPH_GUIDE.md §7). Never raw-insert around it.

import { eq, and, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { agents, entries, orders, type Entry, type Order } from "@/lib/db/schema";

export class AlreadyEnteredError extends Error {
  constructor(public readonly dropId: string) {
    super("already entered this drop");
  }
}

// Postgres unique-violation SQLSTATE. The driver (postgres.js) surfaces it as `.code`.
const PG_UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err: unknown): boolean {
  // Drizzle wraps the driver error in DrizzleQueryError; the postgres.js SQLSTATE lives on
  // `err.cause.code`. A raw postgres.js error exposes it directly on `err.code`. Check both
  // so the dedupe works whether the insert goes through drizzle or the raw client.
  if (typeof err !== "object" || err === null) return false;
  const direct = (err as { code?: string }).code;
  const cause = (err as { cause?: { code?: string } }).cause?.code;
  return direct === PG_UNIQUE_VIOLATION || cause === PG_UNIQUE_VIOLATION;
}

// World ID nullifiers are hex (e.g. "0x2bf8…"). `human_key` stores the hex string verbatim
// (the dedupe key); `nullifier_hash` is numeric(78,0), so convert hex → decimal string.
function hexToDecimalString(hex: string): string {
  const clean = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (clean.length === 0) return "0";
  return BigInt("0x" + clean).toString(10);
}

export interface InsertWebEntryInput {
  dropId: string;
  nullifier: string; // verified World ID v4 nullifier (hex)
  variantId?: string | null;
  verificationLvl?: "orb" | "device" | null;
  // The wallet this entry settles FROM if it wins (M6). For the demo, a web human maps to a
  // demo wallet (e.g. the "human" wallet). Stored so the winner can pay without re-prompting.
  walletAddress?: string | null;
}

// Insert a WEB entry keyed by the World ID nullifier. Returns the new row on success;
// throws AlreadyEnteredError if this human already entered THIS drop (unique violation).
export async function insertWebEntry(input: InsertWebEntryInput): Promise<Entry> {
  try {
    const [row] = await db
      .insert(entries)
      .values({
        dropId: input.dropId,
        humanKey: input.nullifier, // ★ the dedupe key — UNIQUE(drop_id, human_key)
        source: "web",
        nullifierHash: hexToDecimalString(input.nullifier),
        verificationLvl: input.verificationLvl ?? null,
        variantId: input.variantId ?? null,
        walletAddress: input.walletAddress ?? null,
      })
      .returning();
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) throw new AlreadyEnteredError(input.dropId);
    throw err;
  }
}

export interface InsertAgentEntryInput {
  dropId: string;
  // The AgentBook humanId (or wallet-scoped fallback) from agentkit-auth. This is the dedupe
  // key for the AGENT surface — funnels through the SAME UNIQUE(drop_id, human_key) constraint.
  humanId: string;
  variantId?: string | null;
  // The agent's verified wallet (settles its purchase if it wins; M8). Stored at entry time so
  // purchase resolves the signer server-side without re-prompting.
  walletAddress?: string | null;
}

// Insert an AGENT entry keyed by the AgentBook humanId. Mirrors insertWebEntry but for the
// MCP/agent path: source='agent', human_key=humanId, human_id column also set. Returns the new
// row; throws AlreadyEnteredError if this human already entered THIS drop (unique violation).
export async function insertAgentEntry(input: InsertAgentEntryInput): Promise<Entry> {
  try {
    const looksLikeNullifier =
      input.humanId.startsWith("0x") || input.humanId.startsWith("0X");
    const [row] = await db
      .insert(entries)
      .values({
        dropId: input.dropId,
        humanKey: input.humanId, // ★ the dedupe key — UNIQUE(drop_id, human_key)
        source: "agent",
        humanId: input.humanId,
        nullifierHash: looksLikeNullifier ? hexToDecimalString(input.humanId) : null,
        variantId: input.variantId ?? null,
        walletAddress: input.walletAddress ?? null,
      })
      .returning();
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) throw new AlreadyEnteredError(input.dropId);
    throw err;
  }
}

// Fetch a single entry by id (e.g. the /win/[entryId] winner page). Returns undefined if
// the id doesn't exist (page → 404).
export async function getEntryById(entryId: string): Promise<Entry | undefined> {
  const [row] = await db
    .select()
    .from(entries)
    .where(eq(entries.id, entryId))
    .limit(1);
  return row;
}

// The confirmed settlement order for a purchased entry (most recent), so the winner page can
// show the real tx hash + explorer link. Null if none recorded yet.
export async function getConfirmedOrderForEntry(
  entryId: string,
): Promise<Order | undefined> {
  const [row] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.entryId, entryId), eq(orders.status, "confirmed")))
    .orderBy(desc(orders.createdAt))
    .limit(1);
  return row;
}

// Find this human's entry in a drop, by human_key (works for both nullifier and humanId since
// both are stored in the same column). Used by the MCP check_status tool + UI state.
export async function findEntryByHumanKey(
  dropId: string,
  humanKey: string,
): Promise<Entry | undefined> {
  const [row] = await db
    .select()
    .from(entries)
    .where(and(eq(entries.dropId, dropId), eq(entries.humanKey, humanKey)))
    .limit(1);
  return row;
}

// Has this human (by nullifier) already entered this drop? Used to render UI state
// without attempting an insert.
export async function findWebEntry(
  dropId: string,
  nullifier: string,
): Promise<Entry | undefined> {
  const [row] = await db
    .select()
    .from(entries)
    .where(and(eq(entries.dropId, dropId), eq(entries.humanKey, nullifier)))
    .limit(1);
  return row;
}

/** Web UI lookup: World ID key first, then this human's one authorized agent wallet. */
export async function findEntryForSignedInHuman(
  dropId: string,
  worldIdHumanKey: string,
): Promise<Entry | undefined> {
  const direct = await findWebEntry(dropId, worldIdHumanKey);
  if (direct) return direct;

  const [bound] = await db
    .select()
    .from(agents)
    .where(eq(agents.humanId, worldIdHumanKey))
    .limit(1);
  if (!bound?.walletAddress) return undefined;

  const [byWallet] = await db
    .select()
    .from(entries)
    .where(
      and(eq(entries.dropId, dropId), eq(entries.walletAddress, bound.walletAddress)),
    )
    .limit(1);
  if (byWallet && byWallet.humanKey !== worldIdHumanKey) {
    try {
      const looksLikeHex =
        worldIdHumanKey.startsWith("0x") || worldIdHumanKey.startsWith("0X");
      const [updated] = await db
        .update(entries)
        .set({
          humanKey: worldIdHumanKey,
          humanId: worldIdHumanKey,
          nullifierHash: looksLikeHex ? BigInt(worldIdHumanKey).toString(10) : null,
        })
        .where(eq(entries.id, byWallet.id))
        .returning();
      return updated ?? byWallet;
    } catch {
      return byWallet;
    }
  }
  return byWallet;
}

// Count of UNIQUE humans entered in a drop = number of entry rows (the unique constraint
// guarantees one row per human). Drives the fairness panel (M9).
export async function countDropEntries(dropId: string): Promise<number> {
  const rows = await db
    .select({ id: entries.id })
    .from(entries)
    .where(eq(entries.dropId, dropId));
  return rows.length;
}
