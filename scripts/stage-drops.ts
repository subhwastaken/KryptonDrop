// Stage specific demo drops to launch at a chosen offset from NOW (M14 demo tooling).
//
// Re-stages each named drop the same way resetDemo() does — wipes its entries + orders,
// clears drawn_at and the draw seed, then sets it back to `coming_soon` with:
//   opens_at  = now + launchOffsetSeconds
//   closes_at = opens_at + ENTRY_WINDOW_SECONDS   (the standard 10-min entry window)
// The M11 lifecycle ticker then runs the whole SNKRS flow on its own:
//   LAUNCHING IN → (auto-open) ENTRIES CLOSE IN 10:00 → (auto-draw) → WON / SOLD OUT.
//
// `now` is captured ONCE inside stageDropsByOffset so every drop is relative to the same
// instant (per the request: Mac Mini = +1 min, RTX = +3h from call time). Same plan as the
// /secret/admin/reset route — both call the shared stageDropsByOffset() service.
//
// Run against whatever DATABASE_URL points at (local .env or the live Railway DB):
//   tsx scripts/stage-drops.ts
import "dotenv/config";
import {
  stageDropsByOffset,
  ENTRY_WINDOW_SECONDS,
  type StagePlanItem,
} from "@/lib/drops.service";

// The staging plan: drop name → seconds-from-now until it launches (opens).
const PLAN: StagePlanItem[] = [
  { name: "NVIDIA H100 SXM5 Cluster", launchOffsetSeconds: 5 }, // 5 seconds from now
  { name: "NVIDIA Blackwell B200 Supercluster", launchOffsetSeconds: 3 * 60 * 60 }, // 3 hours from now
];

function fmtOffset(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const parts = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s || !parts.length) parts.push(`${s}s`);
  return parts.join(" ");
}

async function main() {
  const { staged, missing } = await stageDropsByOffset(PLAN);

  for (const d of staged) {
    console.log(
      `✓ ${d.name}: coming_soon — launches in ${fmtOffset(d.launchOffsetSeconds)} ` +
        `(opens ${d.opensAt.toISOString()}, closes ${d.closesAt.toISOString()}), ` +
        `entry window ${ENTRY_WINDOW_SECONDS / 60} min.`,
    );
  }
  for (const name of missing) {
    console.error(`✗ drop "${name}" not found — run the seed first; skipped.`);
  }

  console.log("\nDone. The lifecycle ticker will open + draw each drop on the server clock.");
  process.exit(0);
}

void main();
