"use client";

// Header "Sign in with World ID" control. Thin view over the session context — the actual
// IDKit sign-in widget lives once in SessionProvider. The user scans World App ONCE here
// (against the global `signin` action); afterward every drop is a one-tap join with no
// re-scan. When signed in, shows the human-key fingerprint + a Sign out button.
import { useSession } from "@/components/session-provider";

export function WorldIdSignin() {
  const {
    signedIn,
    verificationLvl,
    humanKeyShort,
    loading,
    signinPhase,
    signinError,
    signIn,
    signOut,
  } = useSession();

  // --- Signed in: show fingerprint + sign out -------------------------------
  if (signedIn) {
    return (
      <div className="flex items-center gap-2">
        <span
          className="pill bg-lime"
          title={`Verified human${verificationLvl ? ` · ${verificationLvl}` : ""}`}
        >
          ✓ {verificationLvl === "orb" ? "Orb-verified" : "Verified"}
          {humanKeyShort ? ` · ${humanKeyShort}` : ""}
        </span>
        <button
          type="button"
          onClick={() => void signOut()}
          className="border-[3px] border-ink bg-white px-3 py-1.5 text-xs font-extrabold uppercase brutal-hover"
        >
          Sign out
        </button>
      </div>
    );
  }

  // --- Not signed in: the sign-in CTA ---------------------------------------
  const busy = signinPhase !== "idle";
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void signIn()}
        disabled={busy || loading}
        className="inline-flex items-center gap-2 border-[3px] border-ink bg-ink px-4 py-2 text-xs font-extrabold uppercase text-cream brutal-hover disabled:opacity-60 sm:text-sm"
      >
        {signinPhase === "preparing"
          ? "Preparing…"
          : signinPhase === "verifying"
            ? "Verify in World App…"
            : signinPhase === "submitting"
              ? "Signing in…"
              : "Sign in with World ID"}
      </button>
      {signinError && (
        <span className="text-[11px] font-bold text-destructive">{signinError}</span>
      )}
    </div>
  );
}
