// Hero panel (M11) — first full-screen snap section. Editorial brand heading + spinning 3D
// product stage + compact fairness strip + scroll cue into the first drop. Server component;
// the 3D stage and cue are client islands.
import Link from "next/link";
import HeroModelStageClient from "@/components/hero-model-stage.client";
import ScrollCue from "@/components/scroll-cue";
import ScrollToButton from "@/components/scroll-to-button";
import LaunchTimer from "@/components/launch-timer";

export default function HeroPanel({
  totalEntries,
  openCount,
  scrollToSlug,
  nextLaunch = null,
}: {
  totalEntries: number;
  openCount: number;
  scrollToSlug?: string;
  // ISO timestamp of the soonest upcoming drop launch (real M11 clock), or null.
  nextLaunch?: string | null;
}) {
  return (
    <div className="relative flex min-h-[100svh] flex-col px-5 pb-8 pt-6 sm:px-8">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b-[3px] border-ink pb-4">
        <span className="display text-xl sm:text-2xl text-lime">MONAD·KRYPTON·DROP</span>
        <nav className="flex items-center gap-3 text-xs font-extrabold uppercase">
          <span className="pill bg-lime text-black font-mono">MONAD TESTNET (10143)</span>
          <span className="pill bg-pop-blue text-black font-mono">10,000 TPS · 1s FINALITY</span>
          <Link href="/marketplace" className="pill bg-lime text-black brutal-hover">
            DEX Marketplace
          </Link>
          <Link href="/admin" className="pill brutal-hover">
            Admin
          </Link>
        </nav>
      </header>

      {/* Hero body — editorial heading (left) + spinning 3D stage (right). */}
      <div className="mx-auto grid w-full max-w-7xl flex-1 items-center gap-12 py-10 lg:grid-cols-[1.2fr_1fr] lg:gap-24">
        <div className="flex flex-col gap-9 sm:gap-10">
          <span className="pill bg-lime text-black font-bold">Monad Ecosystem Hackathon 2026 · Per-Second GPU Rentals · A2A Enabled</span>
          <h1 className="display text-[13vw] leading-[1.02] sm:text-7xl lg:text-8xl">
            TRUSTLESS
            <br />
            PER-SECOND GPU
            <br />
            <span className="mt-1 inline-block bg-lime text-black px-3 leading-[1.08] box-decoration-clone">
              COMPUTE RENTALS
            </span>
          </h1>
          <p className="max-w-md text-lg font-medium text-muted-foreground">
            Scarce GPU compute allocated <strong>1 node slot per verified human per rental</strong> —
            settled per-second on Monad with sub-second finality. Gated by World ID ZK-proofs & World AgentKit.
          </p>

          {/* Compact fairness strip — the at-a-glance Sybil-guarantee proof. */}
          <dl className="flex flex-wrap items-center gap-x-4 gap-y-2 border-y-[3px] border-ink py-4 text-sm font-bold uppercase">
            <div className="flex items-baseline gap-1.5">
              <dt className="display text-2xl">{totalEntries}</dt>
              <dd className="text-xs">verified human & agent entries</dd>
            </div>
            <span aria-hidden className="text-muted-foreground">·</span>
            <div className="flex items-baseline gap-1.5">
              <dt className="display text-2xl">1</dt>
              <dd className="text-xs">slot / human</dd>
            </div>
            <span aria-hidden className="text-muted-foreground">·</span>
            <div className="flex items-baseline gap-1.5">
              <dt className="display text-2xl">{openCount}</dt>
              <dd className="text-xs">live compute node{openCount === 1 ? "" : "s"}</dd>
            </div>
            <span aria-hidden className="text-muted-foreground">·</span>
            <div className="flex items-baseline gap-1.5">
              <dt className="display text-2xl">∞</dt>
              <dd className="text-xs">bot hoarders blocked</dd>
            </div>
          </dl>

          <div className="flex flex-wrap items-center gap-4">
            <ScrollToButton
              targetSlug={scrollToSlug}
              className="brutal-lime brutal-hover inline-flex items-center gap-2 px-7 py-4 text-lg font-extrabold uppercase"
            >
              Explore GPU Nodes <span aria-hidden>↓</span>
            </ScrollToButton>
            {/* Small "next drop" countdown — the soonest scheduled launch, on the real clock. */}
            {nextLaunch && (
              <LaunchTimer
                target={nextLaunch}
                mode="launch"
                className="flex items-baseline gap-2 border-[3px] border-ink bg-white px-4 py-2.5 [&_span:last-child]:text-2xl"
              />
            )}
          </div>
        </div>

        {/* Spinning 3D product stage — Mac Mini ⇄ RTX 5090. */}
        <div className="relative h-[42vh] min-h-[300px] w-full lg:h-[68vh] lg:pl-6">
          <HeroModelStageClient />
        </div>
      </div>

      {/* Scroll cue — nudge down into the first drop panel. */}
      <ScrollCue targetSlug={scrollToSlug} />
    </div>
  );
}
