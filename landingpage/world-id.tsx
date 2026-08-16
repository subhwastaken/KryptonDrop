"use client";

import { useSession } from "@/components/session-provider";
import { LandingButton } from "./button";

export function LandingWorldId() {
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

  if (signedIn) {
    return (
      <div className="flex items-center gap-2">
        <span
          className="landing-nav__link is-active whitespace-nowrap"
          title={`Verified human${verificationLvl ? ` · ${verificationLvl}` : ""}`}
        >
          {verificationLvl === "orb" ? "Orb" : "World ID"}
          {humanKeyShort ? ` · ${humanKeyShort}` : ""}
        </span>
        <LandingButton size="sm" onClick={() => void signOut()}>
          SIGN OUT
        </LandingButton>
      </div>
    );
  }

  const busy = signinPhase !== "idle";
  const label =
    signinPhase === "preparing"
      ? "PREPARING…"
      : signinPhase === "verifying"
        ? "VERIFY…"
        : signinPhase === "submitting"
          ? "SIGNING IN…"
          : "WORLD ID";

  return (
    <div className="relative flex items-center">
      <LandingButton size="sm" onClick={() => void signIn()} disabled={busy || loading}>
        {label}
      </LandingButton>
      {signinError ? (
        <span className="sr-only">{signinError}</span>
      ) : null}
    </div>
  );
}
