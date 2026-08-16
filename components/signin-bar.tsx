"use client";

// Persistent "Sign in with World ID" control, fixed to the top-right on every page. Floats
// above the scroll-snap deck so the user can sign in once from anywhere, then 1-tap join any
// drop. Kept compact so it doesn't fight the oversized hero type.
import { WorldIdSignin } from "@/components/world-id-signin";

export function SigninBar() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-end p-3 sm:p-4">
      <div className="pointer-events-auto">
        <WorldIdSignin />
      </div>
    </div>
  );
}
