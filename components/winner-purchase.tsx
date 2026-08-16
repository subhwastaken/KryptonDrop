"use client";

// Client purchase island for the /win/[entryId] winner page (M12). The server component
// renders the static winner context (product, finish, price); this handles the interactive
// "PURCHASE — pay USDC" click and the post-purchase success state.
//
// On click → POST /api/drops/:id/purchase (the SAME route the inline web flow + agent path
// use; it resolves the winner's wallet SERVER-SIDE from entry.wallet_address — human demo
// wallet for web entries, the agent's wallet for agent entries — so it works for WHOEVER won).
// Real USDC settles on chain 4801; we surface the real tx hash + explorer link.
//
// If the entry is already `purchased` when the page loads, the server passes the existing
// tx in and we render the confirmed state immediately (no button).

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Phase = "ready" | "purchasing" | "purchased" | "error";

// MM:SS formatter for the purchase-window countdown.
function fmtMMSS(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// Live countdown to the winner's purchase deadline. Ticks every second; turns red under 60s.
// At zero it refreshes the server component so the page flips to the honest `expired` state.
function PurchaseCountdown({ deadline }: { deadline: string }) {
  const router = useRouter();
  const deadlineMs = new Date(deadline).getTime();
  const [remaining, setRemaining] = useState<number>(() =>
    Math.max(0, Math.round((deadlineMs - Date.now()) / 1000)),
  );
  const crossedRef = useRef(false);

  useEffect(() => {
    crossedRef.current = false;
    const tick = () => {
      const left = Math.max(0, Math.round((deadlineMs - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0 && !crossedRef.current) {
        crossedRef.current = true;
        router.refresh(); // pull the now-expired server state in, once.
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadlineMs, router]);

  const urgent = remaining <= 60;
  return (
    <div
      className={`flex items-baseline gap-3 border-[3px] border-ink px-5 py-3 ${
        urgent ? "bg-destructive text-white" : "bg-white"
      }`}
    >
      <span className="text-xs font-extrabold uppercase tracking-widest">
        Buy within
      </span>
      <span className="display text-3xl tabular-nums sm:text-4xl">
        {fmtMMSS(remaining)}
      </span>
    </div>
  );
}

export default function WinnerPurchase({
  dropId,
  entryId,
  priceUsdc,
  purchaseDeadline = null,
  initialTxHash = null,
  initialExplorerUrl = null,
}: {
  dropId: string;
  entryId: string;
  priceUsdc: string;
  // ISO deadline for the purchase window; null → no countdown shown.
  purchaseDeadline?: string | null;
  initialTxHash?: string | null;
  initialExplorerUrl?: string | null;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(
    initialTxHash ? "purchased" : "ready",
  );
  const [txHash, setTxHash] = useState<string | null>(initialTxHash);
  const [explorerUrl, setExplorerUrl] = useState<string | null>(
    initialExplorerUrl,
  );
  const [error, setError] = useState<string>("");

  const purchase = useCallback(async () => {
    setPhase("purchasing");
    setError("");
    try {
      const res = await fetch(`/api/drops/${dropId}/purchase`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entryId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || `purchase failed (${res.status})`);
      }
      setTxHash(body.txHash ?? null);
      setExplorerUrl(body.explorerUrl ?? null);
      setPhase("purchased");
      // Refresh the server component so a reload/back shows the persisted `purchased` state.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "purchase failed");
      setPhase("error");
    }
  }, [dropId, entryId, router]);

  if (phase === "purchased") {
    return (
      <div className="brutal-lime flex flex-col gap-4 p-6">
        <div className="display text-4xl sm:text-5xl">COMPUTE VOUCHER CLAIMED ✓</div>
        <p className="text-sm font-bold uppercase">
          {priceUsdc} MON settled on Monad Testnet — per-second compute rental voucher minted.
        </p>
        <div className="flex flex-wrap gap-4">
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 border-[3px] border-ink bg-white px-6 py-3 text-base font-extrabold uppercase brutal-hover"
            >
              View transaction ↗
            </a>
          )}
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 border-[3px] border-ink bg-ink text-cream px-6 py-3 text-base font-extrabold uppercase brutal-hover"
          >
            Resell on A2A DEX ↗
          </Link>
        </div>
        {txHash && (
          <code className="break-all font-mono text-xs text-muted-foreground">
            {txHash}
          </code>
        )}
      </div>
    );
  }

  return (
    <div className="brutal-lime flex flex-col gap-4 p-6">
      <div className="display text-5xl sm:text-6xl">COMPUTE SLOT ALLOCATED ✦</div>
      <p className="text-base font-bold uppercase">
        One GPU compute node slot reserved for you. Settle {priceUsdc} MON to claim rental voucher — real
        settlement on Monad Testnet.
      </p>
      {purchaseDeadline && phase !== "purchasing" && (
        <PurchaseCountdown deadline={purchaseDeadline} />
      )}
      <button
        onClick={purchase}
        disabled={phase === "purchasing"}
        className="inline-flex w-fit items-center gap-2 border-[3px] border-ink bg-ink px-8 py-4 text-lg font-extrabold uppercase text-cream brutal-hover disabled:opacity-60"
      >
        {phase === "purchasing"
          ? "Settling MON…"
          : "Claim GPU Rental Voucher — pay MON ↗"}
      </button>
      {error && <p className="text-sm font-bold text-destructive">{error}</p>}
    </div>
  );

}
