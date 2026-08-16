// Next.js server-startup hook (M11). `register()` is called ONCE when a new server instance
// boots, in every runtime — so we conditionally import the Node.js-only lifecycle ticker and
// start it. This is what makes the time-driven drop lifecycle autonomous: once the server is
// up, drops open and draw on the wall clock with no request needed.
//
// Guards:
//   • Only start under the Node.js runtime (the ticker uses postgres.js / node:crypto).
//   • Only when DATABASE_URL is present — `next build`'s page-data collection runs without it,
//     and we must never connect (or run a draw) at build time.
//   • Wrapped so a failure here can never block server readiness.
//
// Docs: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.DATABASE_URL) {
    // No DB configured (e.g. build-time page-data collection) — do not start the ticker.
    return;
  }
  try {
    const { startLifecycleTicker } = await import("@/lib/lifecycle.ticker");
    startLifecycleTicker();
  } catch (err) {
    console.error("[instrumentation] failed to start lifecycle ticker:", err);
  }
}
