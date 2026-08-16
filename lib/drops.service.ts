// Drop & variant domain + lifecycle (M3). Plain TypeScript service module (no Effect).
// Every later milestone is demoed and reset through this. The admin/reset plane sits on top.

import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  drops,
  variants,
  entries,
  orders,
  type Drop,
  type Variant,
  type NewVariant,
} from "@/lib/db/schema";

export type DropStatus = "coming_soon" | "open" | "closed" | "settled";

// --- SNKRS staging knobs (M14) -------------------------------------------------------------
// How far out each demo drop "launches" (coming_soon → open) and how long entries stay open
// (open → draw). Staggered launches keep both LAUNCHING-IN timers on screen at once. Lives
// here (the lower-level module) so both seed.ts and resetDemo share one source of truth.
export const ENTRY_WINDOW_SECONDS = 120; // 2 min entry window after launch
const LAUNCH_OFFSETS: Record<string, number> = {
  "NVIDIA H100 SXM5 Cluster": 5, // launches in 5s
  "NVIDIA Blackwell B200 Supercluster": 3 * 60 * 60,
  "Mac Mini": 5,
  "GeForce RTX 5090": 3 * 60 * 60,
};

// Compute the coming_soon staging timestamps for a drop, relative to `now`:
//   opens_at  = now + per-drop launch offset
//   closes_at = opens_at + entry window
export function stagingFor(
  name: string,
  now: number = Date.now(),
): { opensAt: Date; closesAt: Date } {
  const launchOffset = LAUNCH_OFFSETS[name] ?? 2 * 60;
  const opensAt = new Date(now + launchOffset * 1000);
  const closesAt = new Date(opensAt.getTime() + ENTRY_WINDOW_SECONDS * 1000);
  return { opensAt, closesAt };
}

// Allowed status transitions. Enforced so the demo can't get into an impossible state.
const ALLOWED_TRANSITIONS: Record<DropStatus, DropStatus[]> = {
  coming_soon: ["open"],
  open: ["closed", "coming_soon"], // coming_soon allowed so we can flip the 2nd item back
  closed: ["settled", "open"], // re-open on reset
  settled: ["open"], // re-open on reset for repeated demos
};

export class DropError extends Error {}
export class NotFoundError extends DropError {}
export class InvalidTransitionError extends DropError {}

export interface CreateDropInput {
  name: string;
  status?: DropStatus;
  opensAt?: Date | null;
  closesAt?: Date | null;
  totalSlots?: number;
  priceUsdc?: string | number; // decimal string or number, e.g. "10" or 10
  drawSeed?: string | null;
  variants?: Array<{ name: string; sku?: string | null; stock?: number }>;
}

function toUsdcString(v: string | number | undefined): string {
  if (v === undefined) return "0";
  return typeof v === "number" ? v.toString() : v;
}

export async function createDrop(input: CreateDropInput): Promise<Drop> {
  const [drop] = await db
    .insert(drops)
    .values({
      name: input.name,
      status: input.status ?? "coming_soon",
      opensAt: input.opensAt ?? null,
      closesAt: input.closesAt ?? null,
      totalSlots: input.totalSlots ?? 1,
      priceUsdc: toUsdcString(input.priceUsdc),
      drawSeed: input.drawSeed ?? null,
    })
    .returning();

  if (input.variants?.length) {
    const rows: NewVariant[] = input.variants.map((v) => ({
      dropId: drop.id,
      name: v.name,
      sku: v.sku ?? null,
      stock: v.stock ?? 0,
    }));
    await db.insert(variants).values(rows);
  }
  return drop;
}

export async function addVariant(
  dropId: string,
  v: { name: string; sku?: string | null; stock?: number },
): Promise<Variant> {
  await getDropOrThrow(dropId);
  const [row] = await db
    .insert(variants)
    .values({ dropId, name: v.name, sku: v.sku ?? null, stock: v.stock ?? 0 })
    .returning();
  return row;
}

export async function getDrop(dropId: string): Promise<Drop | undefined> {
  const [row] = await db.select().from(drops).where(eq(drops.id, dropId)).limit(1);
  return row;
}

async function getDropOrThrow(dropId: string): Promise<Drop> {
  const row = await getDrop(dropId);
  if (!row) throw new NotFoundError(`drop ${dropId} not found`);
  return row;
}

export interface DropWithVariants extends Drop {
  variants: Variant[];
}

export async function listDrops(): Promise<DropWithVariants[]> {
  // M11 lazy trigger (on read): apply any time-due transitions BEFORE reading, so every page
  // load / poll reflects the true current state (a drop past opens_at shows open; past
  // closes_at shows drawn). Dynamic import avoids a static cycle (lifecycle → draw → drops).
  // Best-effort: applyDueTransitions never throws, but guard so a read never fails on it.
  try {
    const { applyDueTransitions } = await import("@/lib/lifecycle.service");
    await applyDueTransitions();
  } catch (err) {
    console.error("[drops.listDrops] lazy transition error:", err);
  }

  const allDrops = await db.select().from(drops).orderBy(drops.createdAt);
  if (allDrops.length === 0) return [];
  const allVariants = await db
    .select()
    .from(variants)
    .where(
      inArray(
        variants.dropId,
        allDrops.map((d) => d.id),
      ),
    );
  return allDrops.map((d) => ({
    ...d,
    variants: allVariants.filter((v) => v.dropId === d.id),
  }));
}

export async function getDropWithVariants(
  dropId: string,
): Promise<DropWithVariants | undefined> {
  const drop = await getDrop(dropId);
  if (!drop) return undefined;
  const vs = await db.select().from(variants).where(eq(variants.dropId, dropId));
  return { ...drop, variants: vs };
}

export async function transitionStatus(
  dropId: string,
  next: DropStatus,
): Promise<Drop> {
  const drop = await getDropOrThrow(dropId);
  if (drop.status === next) return drop; // idempotent no-op
  const allowed = ALLOWED_TRANSITIONS[drop.status as DropStatus] ?? [];
  if (!allowed.includes(next)) {
    throw new InvalidTransitionError(
      `cannot transition drop ${dropId} from ${drop.status} to ${next}`,
    );
  }
  const [row] = await db
    .update(drops)
    .set({ status: next })
    .where(eq(drops.id, dropId))
    .returning();
  return row;
}

export async function setSeed(dropId: string, seed: string | null): Promise<Drop> {
  await getDropOrThrow(dropId);
  const [row] = await db
    .update(drops)
    .set({ drawSeed: seed })
    .where(eq(drops.id, dropId))
    .returning();
  return row;
}

// Set the merchant/receiver wallet a winner's purchase is paid to (M6). Null = fall back to
// the RECEIVER_ADDRESS env / agent1 default at purchase time.
export async function setReceiver(
  dropId: string,
  receiverAddress: string | null,
): Promise<Drop> {
  await getDropOrThrow(dropId);
  const [row] = await db
    .update(drops)
    .set({ receiverAddress })
    .where(eq(drops.id, dropId))
    .returning();
  return row;
}

// Demo reset: truncate entries + orders for THIS drop only, re-open it, reset the countdown.
// Scoped to one drop so the seeded products and other drops survive (RALPH_GUIDE.md §8).
export interface ResetOptions {
  // New closes_at, expressed as seconds from now. Defaults to leaving closes_at null (open).
  countdownSeconds?: number | null;
  reopen?: boolean; // default true — set status back to 'open'
}

export async function resetDrop(
  dropId: string,
  opts: ResetOptions = {},
): Promise<DropWithVariants> {
  await getDropOrThrow(dropId);
  const reopen = opts.reopen ?? true;

  await db.transaction(async (tx) => {
    // Delete orders that belong to this drop's entries first (FK on orders.entry_id).
    const dropEntries = await tx
      .select({ id: entries.id })
      .from(entries)
      .where(eq(entries.dropId, dropId));
    const entryIds = dropEntries.map((e) => e.id);
    if (entryIds.length) {
      await tx.delete(orders).where(inArray(orders.entryId, entryIds));
    }
    await tx.delete(entries).where(eq(entries.dropId, dropId));

    const patch: Partial<typeof drops.$inferInsert> = { drawnAt: null };
    if (reopen) patch.status = "open";
    if (opts.countdownSeconds === null) {
      patch.closesAt = null;
    } else if (typeof opts.countdownSeconds === "number") {
      patch.closesAt = new Date(Date.now() + opts.countdownSeconds * 1000);
      patch.opensAt = new Date();
    }
    if (Object.keys(patch).length) {
      await tx.update(drops).set(patch).where(eq(drops.id, dropId));
    }
  });

  const result = await getDropWithVariants(dropId);
  return result!; // existence guaranteed by getDropOrThrow above
}

// Full demo reset choreography (M10 / M11 / M14) — restart the WHOLE SNKRS lifecycle in one
// call, scoped to the seeded demo drops so no other data is touched (RALPH_GUIDE §8).
// For each product (Mac Mini + GeForce RTX 5090) a reset clears its entries+orders, clears
// drawn_at, CLEARS the draw_seed, and re-STAGES it as `coming_soon` with fresh opens_at /
// closes_at (per stagingFor). The lifecycle clock then re-runs LAUNCHING IN → ENTRIES CLOSE
// IN → draw → WON/SOLD OUT with no further input. Idempotent: runnable back-to-back.
export interface ResetDemoResult {
  live: DropWithVariants; // the primary demo drop (Mac Mini), freshly staged
  others: DropWithVariants[]; // every other seeded demo drop that was re-staged (e.g. RTX 5090)
  // Back-compat field, kept for callers; null since both items now re-stage as coming_soon.
  comingSoon: DropWithVariants | null;
}

export async function resetDemo(opts: {
  liveDropName?: string;
  otherDropNames?: string[];
} = {}): Promise<ResetDemoResult> {
  const liveName = opts.liveDropName ?? "NVIDIA H100 SXM5 Cluster";
  const otherNames = opts.otherDropNames ?? ["NVIDIA Blackwell B200 Supercluster"];
  const now = Date.now();

  const liveDrop = await findDropByName(liveName);
  if (!liveDrop) throw new NotFoundError(`live demo drop "${liveName}" not found — run seed first`);

  // Re-stage a single drop: wipe its entries/orders + drawn_at, clear the seed, then put it
  // back to coming_soon with fresh launch/close timestamps so the SNKRS clock restarts.
  const restage = async (drop: Drop): Promise<DropWithVariants> => {
    const { opensAt, closesAt } = stagingFor(drop.name, now);
    // reopen:false so resetDrop only clears data (entries/orders/drawn_at) — we set the
    // coming_soon staging ourselves below in one update.
    await resetDrop(drop.id, { reopen: false });
    await setSeed(drop.id, null);
    await db
      .update(drops)
      .set({ status: "coming_soon", opensAt, closesAt, drawnAt: null })
      .where(eq(drops.id, drop.id));
    return (await getDropWithVariants(drop.id))!;
  };

  const live = await restage(liveDrop);

  const others: DropWithVariants[] = [];
  for (const name of otherNames) {
    const d = await findDropByName(name);
    if (!d) continue;
    others.push(await restage(d));
  }

  return { live, others, comingSoon: null };
}

// Re-stage demo drops at EXPLICIT per-drop launch offsets (seconds from now), instead of the
// fixed LAUNCH_OFFSETS used by resetDemo/seed. Same choreography as resetDemo's restage: wipe
// entries/orders + drawn_at, clear the seed, set coming_soon with opens_at = now + offset and
// closes_at = opens_at + entry window. The lifecycle ticker then runs the whole SNKRS flow on
// the server clock. `now` is captured once so all drops are relative to the same instant.
// Returns one result per plan item that actually exists (missing drops are reported separately).
export interface StagePlanItem {
  name: string;
  launchOffsetSeconds: number;
}
export interface StagedDropResult {
  name: string;
  opensAt: Date;
  closesAt: Date;
  launchOffsetSeconds: number;
}
export async function stageDropsByOffset(
  plan: StagePlanItem[],
): Promise<{ staged: StagedDropResult[]; missing: string[] }> {
  const now = Date.now();
  const staged: StagedDropResult[] = [];
  const missing: string[] = [];

  for (const { name, launchOffsetSeconds } of plan) {
    const drop = await findDropByName(name);
    if (!drop) {
      missing.push(name);
      continue;
    }
    const opensAt = new Date(now + launchOffsetSeconds * 1000);
    const closesAt = new Date(opensAt.getTime() + ENTRY_WINDOW_SECONDS * 1000);

    // reopen:false → resetDrop only clears data; we set the coming_soon staging ourselves.
    await resetDrop(drop.id, { reopen: false });
    await setSeed(drop.id, null);
    await db
      .update(drops)
      .set({ status: "coming_soon", opensAt, closesAt, drawnAt: null })
      .where(eq(drops.id, drop.id));

    staged.push({ name, opensAt, closesAt, launchOffsetSeconds });
  }

  return { staged, missing };
}

// Flip a coming_soon item to open (or back). Used for the demo "second item" reveal.
export async function flipComingSoon(dropId: string): Promise<Drop> {
  const drop = await getDropOrThrow(dropId);
  if (drop.status === "coming_soon") return transitionStatus(dropId, "open");
  if (drop.status === "open") {
    // direct flip back to coming_soon (allowed transition)
    return transitionStatus(dropId, "coming_soon");
  }
  throw new InvalidTransitionError(
    `flipComingSoon only valid from coming_soon/open, drop is ${drop.status}`,
  );
}

// Insert a dummy entry — used by the M3/M6 acceptance tests (reset + draw proofs) and dev
// seeding. Returns the new entry id so callers (e.g. the M6 draw test) can reference it.
export async function insertDummyEntry(
  dropId: string,
  humanKey: string,
  variantId?: string | null,
  walletAddress?: string | null,
): Promise<string> {
  const [row] = await db
    .insert(entries)
    .values({
      dropId,
      humanKey,
      source: "web",
      variantId: variantId ?? null,
      walletAddress: walletAddress ?? null,
    })
    .returning({ id: entries.id });
  return row.id;
}

export async function countEntries(dropId: string): Promise<number> {
  const rows = await db
    .select({ id: entries.id })
    .from(entries)
    .where(eq(entries.dropId, dropId));
  return rows.length;
}

// Used by the seed script to find an existing drop by name (idempotent seeding).
export async function findDropByName(name: string): Promise<Drop | undefined> {
  const [row] = await db
    .select()
    .from(drops)
    .where(eq(drops.name, name))
    .limit(1);
  return row;
}

export async function deleteDrop(dropId: string): Promise<void> {
  // entries/variants/orders cascade via FK onDelete.
  await db.delete(drops).where(eq(drops.id, dropId));
}
