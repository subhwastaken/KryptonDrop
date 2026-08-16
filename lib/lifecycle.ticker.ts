// Autonomous lifecycle ticker (M11) — the background heartbeat that makes time-driven drops
// fire WITHOUT any request. Started once at server boot by `instrumentation.ts` (Node.js
// runtime only). Every ~5s it runs `applyDueTransitions()`, so a drop set to close in 90s (or
// 2h) really opens and really draws on the server's own clock with the browser closed.
//
// Hard requirements (why each guard exists):
//   • NEVER run at build time — `instrumentation.register()` is called in every environment;
//     this module is only dynamically imported when NEXT_RUNTIME === "nodejs" AND we have a
//     DATABASE_URL, so `env -u DATABASE_URL pnpm build` can't trip it.
//   • NEVER throw — applyDueTransitions already catches per-drop; we also wrap the whole tick
//     and the bootstrap so the ticker can never crash the server.
//   • Singleton — guarded on globalThis so Next hot-reload / double-register can't spawn two
//     intervals.

import { applyDueTransitions } from "@/lib/lifecycle.service";

const TICK_INTERVAL_MS = Number(process.env.LIFECYCLE_TICK_MS ?? 5000);

const globalForTicker = globalThis as unknown as {
  __pohLifecycleTicker?: NodeJS.Timeout;
};

let ticking = false; // re-entrancy guard: skip a tick if the previous one is still running.

async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const applied = await applyDueTransitions();
    if (applied.length) {
      for (const a of applied) {
        if (a.kind === "opened") {
          console.log(`[lifecycle.ticker] opened drop "${a.name}" (${a.dropId})`);
        } else {
          console.log(
            `[lifecycle.ticker] drew drop "${a.name}" (${a.dropId}) — ${a.winners} winner(s), ${a.losers} loser(s)`,
          );
        }
      }
    }
  } catch (err) {
    // applyDueTransitions shouldn't throw, but never let the interval die.
    console.error("[lifecycle.ticker] tick error:", err);
  } finally {
    ticking = false;
  }
}

export function startLifecycleTicker(): void {
  if (globalForTicker.__pohLifecycleTicker) return; // already running (singleton).

  console.log(
    `[lifecycle.ticker] starting — applyDueTransitions every ${TICK_INTERVAL_MS}ms`,
  );

  // Kick one tick on startup (catch up anything already due), then the interval.
  void tick();

  const handle = setInterval(() => {
    void tick();
  }, TICK_INTERVAL_MS);
  // Don't keep the event loop alive solely for the ticker (lets the process exit cleanly).
  if (typeof handle.unref === "function") handle.unref();

  globalForTicker.__pohLifecycleTicker = handle;
}
