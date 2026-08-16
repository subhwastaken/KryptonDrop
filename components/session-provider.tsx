"use client";

// Client-side session context for "sign in once with World ID, then 1-tap join raffles".
//
// World ID verification happens in EXACTLY ONE place: this provider owns the IDKit sign-in
// widget and exposes `signIn()` as an awaitable promise. Both the header control and every
// drop's "Join raffle" button call it — there is no per-drop scan. A drop can do
// `if (await signIn()) join()` so an unauthenticated tap signs in once, then auto-joins.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  IDKitRequestWidget,
  proofOfHuman,
  type IDKitResult,
  type RpContext,
} from "@worldcoin/idkit";

export type SigninPhase = "idle" | "preparing" | "verifying" | "submitting";

export interface SessionState {
  signedIn: boolean;
  verificationLvl: "orb" | "device" | null;
  humanKeyShort: string | null;
  // true until the first /api/auth/me resolves (so buttons can avoid flicker).
  loading: boolean;
  // where the single sign-in flow is (drives button labels everywhere).
  signinPhase: SigninPhase;
  // last sign-in error (e.g. user cancelled, World ID error), or "".
  signinError: string;
  // Run the ONE World ID sign-in. Resolves true once a session is established, false if the
  // user cancels or verification fails. No-op (returns true) if already signed in.
  signIn: () => Promise<boolean>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

interface SigninContext {
  rp_context: RpContext;
  app_id: `app_${string}`;
  action: string;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(false);
  const [verificationLvl, setVerificationLvl] = useState<"orb" | "device" | null>(null);
  const [humanKeyShort, setHumanKeyShort] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Single sign-in flow state.
  const [signinPhase, setSigninPhase] = useState<SigninPhase>("idle");
  const [signinError, setSigninError] = useState("");
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<SigninContext | null>(null);
  // Resolver for the in-flight signIn() promise — bridges IDKit's callback API to await.
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  const settle = useCallback((ok: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    if (resolve) resolve(ok);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const body = (await res.json()) as {
        signedIn: boolean;
        verificationLvl?: "orb" | "device" | null;
        humanKeyShort?: string | null;
      };
      setSignedIn(!!body.signedIn);
      setVerificationLvl(body.verificationLvl ?? null);
      setHumanKeyShort(body.humanKeyShort ?? null);
    } catch {
      // network blip — leave current state
    } finally {
      setLoading(false);
    }
  }, []);

  // The widget produced a proof → verify it + open the session server-side, then resolve.
  const onProof = useCallback(
    async (result: IDKitResult) => {
      setSigninPhase("submitting");
      try {
        const res = await fetch("/api/auth/signin", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ idkitResult: result }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body.detail || body.error || `sign-in failed (${res.status})`);
        }
        await refresh();
        setSigninPhase("idle");
        settle(true);
      } catch (err) {
        setSigninError(err instanceof Error ? err.message : "sign-in failed");
        setSigninPhase("idle");
        settle(false);
      }
    },
    [refresh, settle],
  );

  const signIn = useCallback(async (): Promise<boolean> => {
    if (signedIn) return true;
    // If a sign-in is already in flight, await the same one.
    if (resolverRef.current) {
      return new Promise<boolean>((resolve) => {
        const prev = resolverRef.current!;
        resolverRef.current = (ok) => {
          prev(ok);
          resolve(ok);
        };
      });
    }

    setSigninError("");
    setSigninPhase("preparing");
    const promise = new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });

    try {
      const res = await fetch("/api/auth/signin-context", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `could not start sign-in (${res.status})`);
      }
      const data = (await res.json()) as SigninContext;
      setConfig(data);
      setSigninPhase("verifying");
      setOpen(true);
    } catch (err) {
      setSigninError(err instanceof Error ? err.message : "could not start sign-in");
      setSigninPhase("idle");
      settle(false);
    }

    return promise;
  }, [signedIn, settle]);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } finally {
      setSignedIn(false);
      setVerificationLvl(null);
      setHumanKeyShort(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <SessionContext.Provider
      value={{
        signedIn,
        verificationLvl,
        humanKeyShort,
        loading,
        signinPhase,
        signinError,
        signIn,
        signOut,
        refresh,
      }}
    >
      {children}

      {/* The ONE World ID sign-in widget for the whole app. */}
      {config && (
        <IDKitRequestWidget
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            // Closed without finishing → treat as a cancel (resolve false) unless a verify
            // is mid-flight (submitting), in which case onProof will settle it.
            if (!o && (signinPhase === "verifying" || signinPhase === "preparing")) {
              setSigninPhase("idle");
              settle(false);
            }
          }}
          app_id={config.app_id}
          action={config.action}
          rp_context={config.rp_context}
          environment={process.env.NEXT_PUBLIC_WORLD_APP_ENVIRONMENT as any ?? "staging"}
          allow_legacy_proofs={true}
          preset={proofOfHuman({ signal: "" })}
          onSuccess={onProof}
          onError={(code) => {
            setSigninError(`World ID error: ${code}`);
            setSigninPhase("idle");
            settle(false);
          }}
        />
      )}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within <SessionProvider>");
  return ctx;
}
