// Fair draw engine + winner → purchase window (M6). Plain TS service.
//
// At drop close (or admin force-draw) we pick `total_slots` winners UNIFORMLY AT RANDOM from
// the drop's `pending` entries, mark them `won` (with a bounded purchase window) and the rest
// `lost`. A winner can then settle a REAL USDC purchase (M5) within the window; expired or
// non-winning entries cannot purchase.
//
// Seedable for staged demos: if the drop has a `draw_seed`, the winner is DETERMINISTIC —
// the SAME seed + SAME entry set always yields the SAME winners (judges can watch a specific
// human win). With no seed we use a real CSPRNG (node:crypto).

import { createHash, randomBytes } from "node:crypto";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { drops, entries, type Drop, type Entry } from "@/lib/db/schema";
import { getDrop, NotFoundError } from "@/lib/drops.service";
import { transferUsdc } from "@/lib/settlement.service";

export class DrawError extends Error {}
export class NotDrawnError extends DrawError {}
export class NotAWinnerError extends DrawError {}
export class WindowExpiredError extends DrawError {}
export class AlreadyPurchasedError extends DrawError {}
export class NoWalletError extends DrawError {}

// Default purchase window after a draw (seconds). Short enough for a live demo, long enough
// to click. Override per-draw via runDraw({ windowSeconds }).
export const DEFAULT_PURCHASE_WINDOW_SECONDS = 600; // 10 min

// --- Deterministic ranking key -------------------------------------------------------------
// For a seeded draw we need a stable, uniform-ish ordering of entries that depends ONLY on
// (seed, entryId) — never on insertion order or wall-clock. SHA-256(seed || ":" || entryId)
// gives a 256-bit value per entry; sorting by it ascending and taking the first N is a
// uniform random selection for a fixed seed, and identical across runs. With no seed we draw
// fresh randomness per entry so each draw is independent.
function rankKey(seed: string | null, entryId: string): string {
  if (seed === null) {
    // CSPRNG: 32 random bytes, independent of the entry id. Hex so it sorts lexicographically.
    return randomBytes(32).toString("hex");
  }
  return createHash("sha256").update(`${seed}:${entryId}`).digest("hex");
}

export interface DrawResult {
  dropId: string;
  totalSlots: number;
  candidateCount: number;
  winnerIds: string[];
  loserIds: string[];
  seed: string | null;
  drawnAt: Date;
}

export interface RunDrawOptions {
  windowSeconds?: number; // purchase window length; default DEFAULT_PURCHASE_WINDOW_SECONDS
  force?: boolean; // allow drawing even if a previous draw already ran (re-draws pending only)
}

// Run the draw for a drop: pick winners from `pending` entries, mark won/lost, open the
// purchase window on winners. Idempotent-ish: re-running only touches entries still `pending`
// (an already-`won`/`purchased` entry is left alone). Returns the winners/losers.
export async function runDraw(
  dropId: string,
  opts: RunDrawOptions = {},
): Promise<DrawResult> {
  const drop = await getDrop(dropId);
  if (!drop) throw new NotFoundError(`drop ${dropId} not found`);

  const windowSeconds = opts.windowSeconds ?? DEFAULT_PURCHASE_WINDOW_SECONDS;
  const seed = drop.drawSeed ?? null;
  const totalSlots = drop.totalSlots;

  return db.transaction(async (tx) => {
    // Candidates = entries still in the running for THIS drop.
    const candidates = await tx
      .select()
      .from(entries)
      .where(and(eq(entries.dropId, dropId), eq(entries.status, "pending")));

    // Deterministic order: sort candidates by their rank key (stable on entry id for a fixed
    // seed). Ties broken by entry id so the ordering is total and reproducible.
    const ranked = candidates
      .map((e) => ({ entry: e, key: rankKey(seed, e.id) }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.entry.id < b.entry.id ? -1 : 1));

    const winners = ranked.slice(0, totalSlots).map((r) => r.entry);
    const losers = ranked.slice(totalSlots).map((r) => r.entry);
    const drawnAt = new Date();
    const deadline = new Date(drawnAt.getTime() + windowSeconds * 1000);

    if (winners.length) {
      await tx
        .update(entries)
        .set({ status: "won", purchaseDeadline: deadline })
        .where(inArray(entries.id, winners.map((w) => w.id)));
    }
    if (losers.length) {
      await tx
        .update(entries)
        .set({ status: "lost" })
        .where(inArray(entries.id, losers.map((l) => l.id)));
    }

    // Mark the drop closed + stamp the draw time (lifecycle: open → closed at draw).
    await tx
      .update(drops)
      .set({ drawnAt, ...(drop.status === "open" ? { status: "closed" as const } : {}) })
      .where(eq(drops.id, dropId));

    return {
      dropId,
      totalSlots,
      candidateCount: candidates.length,
      winnerIds: winners.map((w) => w.id),
      loserIds: losers.map((l) => l.id),
      seed,
      drawnAt,
    };
  });
}

export interface PurchaseInput {
  entryId: string;
  // The winner's wallet private key (resolved server-side from the demo wallet registry,
  // never sent by the client). Pays `price_usdc` to the drop's receiver/merchant.
  privateKey: `0x${string}`;
  receiverAddress: string;
}

export interface PurchaseResult {
  entryId: string;
  txHash: string;
  explorerUrl: string;
  amountUsdc: string;
  orderId?: string;
  status: "purchased";
}

async function getEntry(entryId: string): Promise<Entry | undefined> {
  const [row] = await db.select().from(entries).where(eq(entries.id, entryId)).limit(1);
  return row;
}

// A winner exercises their purchase window: REAL USDC `price_usdc` transfer (M5) from the
// winner's wallet → the drop's receiver, then entry → `purchased` + order linked. Enforces:
// entry must be `won` (not lost/pending/expired), not already purchased, within the window.
export async function purchaseForEntry(input: PurchaseInput): Promise<PurchaseResult> {
  const entry = await getEntry(input.entryId);
  if (!entry) throw new NotFoundError(`entry ${input.entryId} not found`);

  if (entry.status === "purchased") {
    throw new AlreadyPurchasedError(`entry ${entry.id} already purchased`);
  }
  if (entry.status !== "won") {
    // pending (not drawn yet), lost (non-winner), or expired — none may purchase.
    throw new NotAWinnerError(`entry ${entry.id} is '${entry.status}', not a winner`);
  }
  // Window check. A null deadline means no window was set — treat as open (demo safety).
  if (entry.purchaseDeadline && entry.purchaseDeadline.getTime() < Date.now()) {
    // Window lapsed → mark expired so the state is honest, then reject.
    await db.update(entries).set({ status: "expired" }).where(eq(entries.id, entry.id));
    throw new WindowExpiredError(`entry ${entry.id} purchase window expired`);
  }

  const drop = await getDrop(entry.dropId);
  if (!drop) throw new NotFoundError(`drop ${entry.dropId} not found`);

  // Real on-chain settlement of the drop price (M5 service). Records an `orders` row linked
  // to this entry. Throws InsufficientFundsError (→ 402) if the winner can't pay.
  const result = await transferUsdc({
    privateKey: input.privateKey,
    to: input.receiverAddress,
    amount: drop.priceUsdc, // numeric string, e.g. "10"
    entryId: entry.id,
    variantId: entry.variantId ?? null,
    recordOrder: true,
  });

  if (result.status !== "confirmed") {
    // Leave the entry `won` so the winner can retry; surface the failure.
    throw new DrawError(`settlement tx ${result.txHash} did not confirm`);
  }

  await db.update(entries).set({ status: "purchased" }).where(eq(entries.id, entry.id));

  return {
    entryId: entry.id,
    txHash: result.txHash,
    explorerUrl: result.explorerUrl,
    amountUsdc: result.amountUsdc,
    orderId: result.orderId,
    status: "purchased",
  };
}

// Convenience read: a drop's entries grouped by status (drives the admin/demo view).
export async function getDrawState(dropId: string): Promise<{
  drop: Drop | undefined;
  winners: Entry[];
  losers: Entry[];
  pending: Entry[];
  purchased: Entry[];
}> {
  const drop = await getDrop(dropId);
  const rows = await db.select().from(entries).where(eq(entries.dropId, dropId));
  return {
    drop,
    winners: rows.filter((e) => e.status === "won"),
    losers: rows.filter((e) => e.status === "lost"),
    pending: rows.filter((e) => e.status === "pending"),
    purchased: rows.filter((e) => e.status === "purchased"),
  };
}
