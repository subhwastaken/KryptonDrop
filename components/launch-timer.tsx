"use client";

// Live countdown (M12). Drives the two on-panel timers that visualize the REAL M11
// lifecycle clock — never faked:
//   • mode="launch"  → "LAUNCHES IN …"      (coming_soon, counts down to opens_at)
//   • mode="entry"   → "ENTRIES CLOSE IN …" (open, counts down to closes_at)
//
// When the countdown crosses zero it calls router.refresh(), which re-runs the server
// component. The M11 lazy trigger (applyDueTransitions in listDrops) has by then flipped
// the drop (coming_soon→open, or open→drawn), so the refreshed panel shows the new real
// state — open entry button, or SOLD OUT / winner. The ticker would do this anyway within
// ~5s; the zero-cross refresh just makes the UI react the instant the clock hits zero.
//
// Format: ≥1h → "1h 58m" (the 2h RTX drop); <1h → "MM:SS" (the 90s Mac Mini drop).

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type LaunchTimerMode = "launch" | "entry";

const LABEL: Record<LaunchTimerMode, string> = {
  launch: "Launches in",
  entry: "Entries close in",
};

function fmt(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${String(m).padStart(2, "0")}m`;
  }
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function LaunchTimer({
  target,
  mode,
  className,
}: {
  // ISO string of the boundary (opens_at for launch, closes_at for entry). Null → render nothing.
  target: string | null;
  mode: LaunchTimerMode;
  className?: string;
}) {
  const router = useRouter();
  const targetMs = target ? new Date(target).getTime() : null;

  // Seconds remaining. Initialize from the target so the first paint is correct (no flash of 00:00).
  const [remaining, setRemaining] = useState<number>(() =>
    targetMs == null ? 0 : Math.max(0, Math.round((targetMs - Date.now()) / 1000)),
  );
  // Once-per-crossing guard for the refresh (a ref, so toggling it doesn't itself re-render).
  const crossedRef = useRef(false);

  useEffect(() => {
    if (targetMs == null) return;
    crossedRef.current = false;

    const tick = () => {
      const left = Math.max(0, Math.round((targetMs - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0 && !crossedRef.current) {
        // Boundary reached — pull the now-updated real server state in, exactly once.
        crossedRef.current = true;
        router.refresh();
      }
    };

    tick(); // sync immediately on mount / target change
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetMs, router]);

  if (targetMs == null) return null;

  // Once we've crossed zero, keep showing 00:00 (the refresh will swap the whole panel shortly).
  return (
    <div
      className={
        className ??
        "flex items-baseline gap-3 border-[3px] border-ink bg-white px-5 py-3"
      }
    >
      <span className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground">
        {LABEL[mode]}
      </span>
      <span className="display text-3xl tabular-nums sm:text-4xl">
        {fmt(remaining)}
      </span>
    </div>
  );
}
