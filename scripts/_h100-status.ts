import "dotenv/config";
import { listDrops } from "../lib/drops.service";

function fmtRemaining(ms: number): { ms: number; minutes: number; seconds: number; text: string } {
  const abs = Math.max(0, ms);
  const minutes = Math.floor(abs / 60000);
  const seconds = Math.floor((abs % 60000) / 1000);
  const text =
    minutes > 0
      ? `${minutes}m ${seconds}s`
      : `${seconds}s`;
  return { ms: abs, minutes, seconds, text };
}

async function main() {
  const now = Date.now();
  const drops = await listDrops();
  const drop =
    drops.find((d) => d.id === "559c99f1-d1d3-44b8-8d60-8849e125817c") ??
    drops.find((d) => d.name.toLowerCase().includes("h100"));

  if (!drop) {
    console.log(JSON.stringify({ error: "H100 drop not found", now: new Date(now).toISOString(), names: drops.map((d) => d.name) }));
    process.exit(1);
  }

  const opensAt = drop.opensAt ? new Date(drop.opensAt).getTime() : null;
  const closesAt = drop.closesAt ? new Date(drop.closesAt).getTime() : null;

  let remainingKind: string | null = null;
  let remainingMs = 0;
  if (drop.status === "coming_soon" && opensAt != null) {
    remainingKind = "until_open";
    remainingMs = opensAt - now;
  } else if (drop.status === "open" && closesAt != null) {
    remainingKind = "until_close";
    remainingMs = closesAt - now;
  }

  console.log(
    JSON.stringify(
      {
        now: new Date(now).toISOString(),
        id: drop.id,
        name: drop.name,
        status: drop.status,
        opensAt: drop.opensAt,
        closesAt: drop.closesAt,
        remainingKind,
        remaining: remainingKind ? fmtRemaining(remainingMs) : null,
      },
      null,
      2,
    ),
  );
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
