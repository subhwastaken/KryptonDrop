// Real time-driven lifecycle (M11) — drops transition on the SERVER'S OWN CLOCK, with no
// admin intervention. This is the "no smoke and mirrors" milestone: set a drop to open/close
// at a future timestamp and the server opens entries and runs the draw when the clock hits
// zero — even with the browser closed and nothing nudging it.
//
// Two complementary triggers fire `applyDueTransitions()`:
//   1. LAZY (on read): called from `listDrops()` and the single-drop entry-status read, so any
//      page load or poll reflects the true current state immediately.
//   2. AUTONOMOUS (background ticker): `instrumentation.ts` → `lib/lifecycle.ticker.ts` runs
//      `applyDueTransitions()` on a ~5s setInterval inside the Node.js server process. THIS is
//      what makes "wait 2h with the tab closed and it still fires" literally true.
//
// The transitions reuse the EXACT M6 draw/settlement/dedupe code (`runDraw`) — only the
// *trigger* changes from an admin call to the wall clock. The draw is guarded so the ticker
// and a concurrent lazy read can never double-draw the same drop.
//
// Honest scope note: the ticker runs inside the single Railway web service. For this
// one-instance demo it is genuinely autonomous — not a distributed/HA scheduler. If the app
// scaled to N instances, N tickers would race, but the atomic draw guard below makes that
// safe (exactly one caller performs each draw); the lazy-on-read path is the backstop.

import { and, eq, isNotNull, lte, sql as drizzleSql } from "drizzle-orm";
import { db } from "@/lib/db";
import { drops, type Drop } from "@/lib/db/schema";
import { runDraw } from "@/lib/draw.service";

// --- Timing helper for the UI (M12 reads this) ---------------------------------------------

export type DropPhase =
  | "coming_soon" // before opens_at
  | "open" // accepting entries (before closes_at)
  | "closing" // open, closes_at passed but draw not yet applied (transient)
  | "drawn"; // closed/settled or already drawn

export interface DropTiming {
  phase: DropPhase;
  opensAt: Date | null;
  closesAt: Date | null;
  // Seconds until the next boundary (clamped at 0). Null when the boundary doesn't apply.
  secondsUntilOpen: number | null;
  secondsUntilClose: number | null;
}

function secondsUntil(target: Date | null, now: number): number | null {
  if (!target) return null;
  return Math.max(0, Math.round((target.getTime() - now) / 1000));
}

// Pure timing view of a drop — what phase it's in and how long until the next boundary.
// Drives the launch/entry countdowns (M12). Does NOT mutate anything.
export function dropTiming(drop: Drop, now: number = Date.now()): DropTiming {
  const opensAt = drop.opensAt ?? null;
  const closesAt = drop.closesAt ?? null;

  let phase: DropPhase;
  if (drop.status === "coming_soon") {
    phase = "coming_soon";
  } else if (drop.status === "closed" || drop.status === "settled" || drop.drawnAt) {
    phase = "drawn";
  } else if (drop.status === "open" && closesAt && closesAt.getTime() <= now) {
    // Past the close time but the transition hasn't been applied yet (will be on next tick/read).
    phase = "closing";
  } else {
    phase = "open";
  }

  return {
    phase,
    opensAt,
    closesAt,
    secondsUntilOpen: secondsUntil(opensAt, now),
    secondsUntilClose: secondsUntil(closesAt, now),
  };
}

// --- The transition engine -----------------------------------------------------------------

export interface AppliedTransition {
  dropId: string;
  name: string;
  kind: "opened" | "drawn";
  // For draws: how many winners/losers resulted.
  winners?: number;
  losers?: number;
}

// Apply every transition that is DUE by the wall clock right now:
//   • coming_soon with opens_at <= now      → open
//   • open with closes_at <= now (not drawn) → run the draw (→ closed + winner/losers)
// Idempotent and concurrency-safe: each draw is elected by an atomic conditional UPDATE so
// only one caller (ticker OR lazy read) actually draws; everyone else no-ops. Never throws —
// errors are caught per-drop and logged so a single bad drop can't wedge the ticker or a page
// load (the caller treats this as best-effort).
export async function applyDueTransitions(
  now: Date = new Date(),
): Promise<AppliedTransition[]> {
  const applied: AppliedTransition[] = [];

  // 1) coming_soon → open for any drop whose opens_at has passed.
  try {
    const toOpen = await db
      .select()
      .from(drops)
      .where(
        and(
          eq(drops.status, "coming_soon"),
          isNotNull(drops.opensAt),
          lte(drops.opensAt, now),
        ),
      );
    for (const drop of toOpen) {
      // Conditional update elects one caller; concurrent callers see 0 rows and skip.
      const opened = await db
        .update(drops)
        .set({ status: "open" })
        .where(and(eq(drops.id, drop.id), eq(drops.status, "coming_soon")))
        .returning({ id: drops.id });
      if (opened.length) {
        applied.push({ dropId: drop.id, name: drop.name, kind: "opened" });
      }
    }
  } catch (err) {
    console.error("[lifecycle] open-transition error:", err);
  }

  // 2) open → closed + DRAW for any drop whose closes_at has passed and hasn't drawn yet.
  try {
    const toDraw = await db
      .select()
      .from(drops)
      .where(
        and(
          eq(drops.status, "open"),
          isNotNull(drops.closesAt),
          lte(drops.closesAt, now),
          // Belt-and-suspenders: only consider not-yet-drawn drops.
          drizzleSql`${drops.drawnAt} IS NULL`,
        ),
      );
    for (const drop of toDraw) {
      // ── Atomic draw guard ──────────────────────────────────────────────────────────────
      // Elect exactly ONE caller to perform this draw via a conditional update that stamps
      // drawn_at only if it's still open + un-drawn. Whoever updates a row owns the draw;
      // concurrent callers (other ticker fires, lazy reads, multiple instances) get 0 rows
      // and skip — so runDraw runs at most once per close, no double-draw.
      const claimed = await db
        .update(drops)
        .set({ drawnAt: now })
        .where(
          and(
            eq(drops.id, drop.id),
            eq(drops.status, "open"),
            drizzleSql`${drops.drawnAt} IS NULL`,
          ),
        )
        .returning({ id: drops.id });
      if (!claimed.length) continue; // someone else is drawing this drop.

      try {
        // runDraw re-reads candidates, marks won/lost, opens the purchase window, and sets the
        // drop to `closed`. It also stamps drawn_at again (harmless — same value-ish); our
        // pre-stamp is what makes the claim atomic.
        const result = await runDraw(drop.id);
        applied.push({
          dropId: drop.id,
          name: drop.name,
          kind: "drawn",
          winners: result.winnerIds.length,
          losers: result.loserIds.length,
        });
      } catch (drawErr) {
        // The draw itself failed AFTER we claimed it. Roll back the claim so a later tick can
        // retry (otherwise drawn_at would be set with no winners and the drop would be stuck).
        console.error(`[lifecycle] draw failed for drop ${drop.id}:`, drawErr);
        await db
          .update(drops)
          .set({ drawnAt: null })
          .where(eq(drops.id, drop.id))
          .catch((rbErr) =>
            console.error(`[lifecycle] claim-rollback failed for ${drop.id}:`, rbErr),
          );
      }
    }
  } catch (err) {
    console.error("[lifecycle] draw-transition error:", err);
  }

  return applied;
}
