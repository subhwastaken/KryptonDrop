// GET|POST /secret/admin/reset — demo reset endpoint. Visiting this URL in a browser
// re-stages the SNKRS demo from scratch:
//   • Mac Mini        → coming_soon, launches in 1 minute
//   • GeForce RTX 5090 → coming_soon, launches in 3 hours
// Each drop's entries/orders + draw seed are wiped; the M11 lifecycle ticker then opens and
// draws each on the server clock with no further input.
//
// ⚠️ Unauthenticated by request — this is a throwaway demo project. Do NOT copy this pattern
// into anything real; a public reset endpoint would let anyone nuke the data.
import { stageDropsByOffset, type StagePlanItem } from "@/lib/drops.service";

export const dynamic = "force-dynamic";

const PLAN: StagePlanItem[] = [
  { name: "NVIDIA H100 SXM5 Cluster", launchOffsetSeconds: 60 }, // 1 minute from now
  { name: "NVIDIA Blackwell B200 Supercluster", launchOffsetSeconds: 3 * 60 * 60 }, // 3 hours from now
];

function fmtOffset(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s || !parts.length) parts.push(`${s}s`);
  return parts.join(" ");
}

async function run(): Promise<Response> {
  try {
    const { staged, missing } = await stageDropsByOffset(PLAN);
    const lines = [
      "DEMO RESET — drops re-staged. The lifecycle ticker will open + draw each on the server clock.",
      "",
      ...staged.map(
        (d) =>
          `✓ ${d.name}: coming_soon — launches in ${fmtOffset(d.launchOffsetSeconds)} ` +
          `(opens ${d.opensAt.toISOString()}, closes ${d.closesAt.toISOString()})`,
      ),
      ...missing.map((n) => `✗ ${n}: not found — run the seed first; skipped.`),
    ];
    // Plain text so it reads cleanly when opened in a browser.
    return new Response(lines.join("\n") + "\n", {
      status: missing.length && !staged.length ? 404 : 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    console.error("[secret/admin/reset] error:", err);
    return new Response(
      `RESET FAILED: ${err instanceof Error ? err.message : "unknown error"}\n`,
      { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }
}

export async function GET(): Promise<Response> {
  return run();
}

export async function POST(): Promise<Response> {
  return run();
}
