"use client";

// World ID drop entry + winner-purchase flow. Sign-in is global (SessionProvider owns the
// ONE IDKit widget); this component never scans. The journey here:
//   1. JOIN — if signed in, POST /api/drops/:id/enter (session → human key, no scan). If not
//      signed in, run the single sign-in first (await signIn()) then join automatically.
//   2. poll /api/drops/:id/entry-status for the draw result
//   3. when 'won', show the "YOU WON — PURCHASE" CTA → POST /api/drops/:id/purchase
//      (real USDC settlement on chain 4801) → success state w/ explorer link
//
// The signing wallet for the web winner is the "human" demo wallet, resolved server-side
// from the entry's stored wallet_address (set at /enter time) — keys never cross the wire.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "@/components/session-provider";

type EntryState =
  | "idle"
  | "submitting"
  | "entered" // in the draw, pending
  | "already-entered"
  | "won" // drawn, this human won — can purchase
  | "lost" // drawn, did not win
  | "purchasing" // settling USDC
  | "purchased" // bought, tx confirmed
  | "expired"
  | "error";

const PENDING_STATES: EntryState[] = ["entered", "already-entered"];

export function WorldIdEntry({
  dropId,
  variantId,
  disabled,
  showGenericSoldOutFallback = false,
}: {
  dropId: string;
  variantId?: string | null;
  disabled?: boolean;
  showGenericSoldOutFallback?: boolean;
}) {
  const { signedIn, signinPhase, signIn, loading } = useSession();
  const [state, setState] = useState<EntryState>("idle");
  const [message, setMessage] = useState<string>("");
  const [entryId, setEntryId] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [explorerUrl, setExplorerUrl] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // POST the session-based entry (no scan — the server reuses the signed-in human key).
  const postEntry = useCallback(async () => {
    setState("submitting");
    setMessage("");
    try {
      const res = await fetch(`/api/drops/${dropId}/enter`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ variantId: variantId ?? undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.detail || body.error || `entry failed (${res.status})`);
      }
      if (body.alreadyEntered) {
        setState("already-entered");
        setMessage("You're already entered in this drop.");
      } else {
        setEntryId(body.entry?.id ?? null);
        setState("entered");
        setMessage("You're in! One GPU rental slot reserved for this verified human.");
      }
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "entry failed");
    }
  }, [dropId, variantId]);

  // The single entry action. Signed in → join immediately. Not signed in → run the ONE World
  // ID sign-in, then auto-join on success.
  const join = useCallback(async () => {
    if (signedIn) {
      await postEntry();
      return;
    }
    const ok = await signIn();
    if (ok) await postEntry();
    // If the user cancelled sign-in, just fall back to idle (signinPhase resets itself).
  }, [signedIn, signIn, postEntry]);

  // Restore entry from session if it exists in the database
  useEffect(() => {
    if (!signedIn) {
      setState("idle");
      setEntryId(null);
      setSource(null);
      return;
    }
    const checkExisting = async () => {
      try {
        const res = await fetch(`/api/drops/${dropId}/my-entry`);
        if (!res.ok) return;
        const body = await res.json();
        if (body.entry) {
          const entry = body.entry;
          setEntryId(entry.id);
          setSource(entry.source ?? null);
          if (entry.status === "purchased") {
            setState("purchased");
            if (body.order?.txHash) {
              setTxHash(body.order.txHash);
              setExplorerUrl(body.order.explorerUrl ?? null);
            } else {
              const statusRes = await fetch(`/api/drops/${dropId}/entry-status?entryId=${entry.id}`);
              if (statusRes.ok) {
                const statusBody = await statusRes.json();
                if (statusBody.order?.txHash) {
                  setTxHash(statusBody.order.txHash);
                  setExplorerUrl(statusBody.order.explorerUrl);
                }
              }
            }
          } else if (entry.status === "won") {
            setState("won");
            setMessage("You won a slot. Purchase below.");
          } else if (entry.status === "lost") {
            setState("lost");
            setMessage("This drop was drawn — you weren't selected this time.");
          } else if (entry.status === "expired") {
            setState("expired");
            setMessage("Your purchase window expired.");
          } else {
            setState("already-entered");
            setMessage("You're already entered in this drop.");
          }
        } else {
          setState("idle");
          setEntryId(null);
        }
      } catch (err) {
        console.error("failed to fetch existing entry:", err);
      }
    };
    void checkExisting();
  }, [dropId, signedIn]);

  // Step 4: once we hold an entry id and are pending, poll the draw result.
  useEffect(() => {
    if (!entryId || !PENDING_STATES.includes(state)) return;
    const poll = async () => {
      try {
        const res = await fetch(
          `/api/drops/${dropId}/entry-status?entryId=${encodeURIComponent(entryId)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const body = await res.json();
        if (body.status === "won") {
          setState("won");
          setMessage("You won a slot. Purchase below.");
        } else if (body.status === "lost") {
          setState("lost");
          setMessage("This drop was drawn — you weren't selected this time.");
        } else if (body.status === "purchased") {
          if (body.order) {
            setTxHash(body.order.txHash);
            setExplorerUrl(body.order.explorerUrl);
          }
          setState("purchased");
        } else if (body.status === "expired") {
          setState("expired");
          setMessage("Your purchase window expired.");
        }
      } catch {
        // transient — keep polling
      }
    };
    pollRef.current = setInterval(poll, 4000);
    void poll();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [entryId, state, dropId]);

  // Step 5: the winner exercises the purchase → real USDC settlement.
  const purchase = useCallback(async () => {
    if (!entryId) return;
    setState("purchasing");
    setMessage("");
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
      setState("purchased");
    } catch (err) {
      setState("won"); // back to the CTA so they can retry
      setMessage(err instanceof Error ? err.message : "purchase failed");
    }
  }, [dropId, entryId]);

  // Busy while joining (this drop) OR while the global sign-in is mid-flight (triggered from
  // this button). Either way the button should show progress + stay disabled.
  const busy = state === "submitting" || signinPhase !== "idle";

  // Return the generic fallback if the drop is sold out and the visitor didn't participate
  if (showGenericSoldOutFallback && state === "idle" && !loading) {
    return (
      <div className="brutal-lime flex flex-col gap-1 p-5">
        <div className="display text-4xl sm:text-5xl">ALL SLOTS ALLOCATED</div>
        <p className="text-sm font-bold uppercase">
          This compute node was drawn — one verified human/agent won the rental slot.
        </p>
      </div>
    );
  }

  // --- Render the right block for each state ---------------------------------

  if (state === "purchased") {
    return (
      <div className="brutal-lime flex flex-col gap-3 p-5">
        <div className="display text-3xl">PURCHASED ✓</div>
        <p className="text-sm font-bold uppercase">
          Real MON settled on Monad Testnet (10143).
        </p>
        {source === "agent" && (
          <p className="text-xs font-bold uppercase text-muted-foreground">
            Entered and purchased by your agent on your behalf.
          </p>
        )}
        {(explorerUrl || txHash) && (
          <a
            href={explorerUrl ?? `https://testnet.monadexplorer.com/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center gap-1 border-[3px] border-ink bg-white px-4 py-2 text-sm font-extrabold uppercase brutal-hover"
          >
            View tx ↗
          </a>
        )}
        {txHash ? (
          <code className="break-all font-mono text-xs">{txHash}</code>
        ) : (
          <p className="text-xs font-bold uppercase text-muted-foreground">
            Loading transaction hash…
          </p>
        )}
      </div>
    );
  }

  if (state === "won" || state === "purchasing") {
    return (
      <div className="brutal-lime flex flex-col gap-3 p-5">
        <div className="display text-3xl">YOU WON ✦</div>
        <p className="text-sm font-bold uppercase">
          One slot reserved for you. Pay to claim it.
        </p>
        <button
          onClick={purchase}
          disabled={state === "purchasing"}
          className="inline-flex w-fit items-center gap-2 border-[3px] border-ink bg-ink px-7 py-4 text-lg font-extrabold uppercase text-cream brutal-hover disabled:opacity-60"
        >
          {state === "purchasing" ? "Settling MON…" : "Purchase — pay MON ↗"}
        </button>
        {entryId && (
          <Link
            href={`/win/${entryId}`}
            className="text-sm font-extrabold uppercase underline underline-offset-4"
          >
            View your winner page ↗
          </Link>
        )}
        {message && <p className="text-sm font-bold text-destructive">{message}</p>}
      </div>
    );
  }


  if (state === "lost") {
    return (
      <div className="brutal flex flex-col gap-1 p-5">
        <div className="display text-2xl">NOT SELECTED</div>
        <p className="text-sm font-medium">{message}</p>
      </div>
    );
  }

  if (state === "expired") {
    return (
      <div className="brutal flex flex-col gap-1 p-5">
        <div className="display text-2xl">WINDOW EXPIRED</div>
        <p className="text-sm font-medium">{message}</p>
      </div>
    );
  }

  if (state === "entered" || state === "already-entered") {
    return (
      <div className="brutal-lime flex flex-col gap-2 p-5">
        <div className="display text-2xl">
          {state === "already-entered" ? "ALREADY ENTERED" : "YOU'RE IN ✓"}
        </div>
        <p className="text-sm font-bold uppercase">
          One slot reserved for this verified human. Awaiting the draw…
        </p>
        {source === "agent" && (
          <p className="text-xs font-bold uppercase">Your agent entered this drop for you.</p>
        )}
      </div>
    );
  }

  if (state === "idle" && disabled) {
    return (
      <div className="brutal flex items-center gap-2 px-5 py-4 font-extrabold uppercase text-muted-foreground">
        Not open for entry
      </div>
    );
  }

  // Idle entry: one button. Signed in → "Join raffle" (one tap). Not signed in → the same
  // button runs the single World ID sign-in first, then auto-joins. There is no per-drop scan.
  const label = busy
    ? signinPhase === "preparing"
      ? "Preparing…"
      : signinPhase === "verifying"
        ? "Verify in World App…"
        : signinPhase === "submitting"
          ? "Signing in…"
          : "Reserving slot…"
    : signedIn
      ? "Reserve GPU compute slot — one tap"
      : "Verify with World ID to reserve slot";

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={join}
        disabled={disabled || busy}
        data-state={state}
        className="inline-flex items-center justify-center gap-2 border-[3px] border-ink bg-lime px-7 py-4 text-lg font-extrabold uppercase text-ink brutal-hover disabled:opacity-60"
      >
        {label}
      </button>

      <p className="text-xs font-medium text-muted-foreground">
        {signedIn
          ? "You're verified — no need to scan again. 1 GPU rental slot per human is enforced."
          : "Verify once with World ID — then reserve GPU rental slots with a single tap."}
      </p>

      {message && (
        <p
          className={
            state === "error"
              ? "text-sm font-bold text-destructive"
              : "text-sm font-medium text-muted-foreground"
          }
        >
          {message}
        </p>
      )}
    </div>
  );
}
